from mage_integrations.connections.trino import Trino as TrinoConnection
from mage_integrations.destinations.constants import (
    INTERNAL_COLUMN_CREATED_AT,
    UNIQUE_CONFLICT_METHOD_UPDATE,
)
from mage_integrations.destinations.sql.base import Destination
from mage_integrations.destinations.sql.utils import (
    build_alter_table_command,
    build_create_table_command,
    build_insert_command,
    clean_column_name,
    column_type_mapping as column_type_mapping_orig,
)
from mage_integrations.destinations.trino.utils import convert_column_type, convert_json_or_string
from typing import Dict, List, Tuple
import json


class TrinoConnector(Destination):
    def build_connection(self) -> TrinoConnection:
        return TrinoConnection(
            catalog=self.config['catalog'],
            host=self.config['host'],
            password=self.config.get('password'),
            port=self.config.get('port'),
            schema=self.config['schema'],
            username=self.config['username'],
            verify=self.config.get('ssl', False),
        )

    def build_create_table_commands(
        self,
        schema: Dict,
        schema_name: str,
        stream: str,
        table_name: str,
        database_name: str = None,
        unique_constraints: List[str] = None,
    ) -> List[str]:
        return [
            build_create_table_command(
                column_type_mapping=self.column_type_mapping(schema),
                columns=schema['properties'].keys(),
                full_table_name=f'{schema_name}.{table_name}',
                if_not_exists=True,
                # Unique constraint is not supported
                # https://trino.io/docs/current/sql/create-table.html
                unique_constraints=None,
            ),
        ]

    def build_alter_table_commands(
        self,
        schema: Dict,
        schema_name: str,
        stream: str,
        table_name: str,
        database_name: str = None,
        unique_constraints: List[str] = None,
    ) -> List[str]:
        results = self.build_connection().load(f"""
DESCRIBE {schema_name}.{table_name}
        """)
        current_columns = [r[0].lower() for r in results]
        schema_columns = schema['properties'].keys()
        new_columns = [c for c in schema_columns if clean_column_name(c) not in current_columns]

        if not new_columns:
            return []

        # TODO: Support alter column types
        return [
            build_alter_table_command(
                column_type_mapping=self.column_type_mapping(schema),
                columns=new_columns,
                full_table_name=f'{schema_name}.{table_name}',
            ),
        ]

    def build_insert_commands(
        self,
        records: List[Dict],
        schema: Dict,
        schema_name: str,
        table_name: str,
        database_name: str = None,
        unique_conflict_method: str = None,
        unique_constraints: List[str] = None,
    ) -> List[str]:
        columns = list(schema['properties'].keys())
        insert_columns, insert_values = build_insert_command(
            column_type_mapping=self.column_type_mapping(schema),
            columns=columns,
            records=records,
            convert_array_func=self.convert_array,
            string_parse_func=self.string_parse_func,
        )
        insert_columns = ', '.join(insert_columns)
        insert_values = ', '.join(insert_values)

        commands = [
            f'INSERT INTO {schema_name}.{table_name} ({insert_columns})',
            f'VALUES {insert_values}',
        ]

        return self.wrap_insert_commands(commands)

    def column_type_mapping(self, schema: Dict) -> Dict:
        return column_type_mapping_orig(
            schema,
            convert_column_type,
            lambda item_type_converted: 'JSON',
        )

    def convert_array(self, value: str, column_type_dict: Dict) -> str:
        if len(value) == 0:
            return 'NULL'

        return f"JSON '{json.dumps(value)}'"

    def calculate_records_inserted_and_updated(
        self,
        data: List[List[Tuple]],
        unique_constraints: List[str] = None,
        unique_conflict_method: str = None,
    ) -> Tuple:
        records_inserted = 0
        for array_of_tuples in data:
            for t in array_of_tuples:
                if len(t) >= 1 and type(t[0]) is int:
                    records_inserted += t[0]

        return records_inserted, 0

    def does_table_exist(
        self,
        schema_name: str,
        table_name: str,
        database_name: str = None,
    ) -> bool:
        tables = self.build_connection().load(
            f'SHOW TABLES FROM {schema_name} LIKE \'{table_name}\'',
        )
        return len(tables) > 0

    def string_parse_func(self, value: str, column_type_dict: Dict) -> str:
        return convert_json_or_string(value, column_type_dict)

    def wrap_insert_commands(self, commands: List[str]) -> List[str]:
        commands_string = '\n'.join(commands)
        return [
            commands_string,
        ]
