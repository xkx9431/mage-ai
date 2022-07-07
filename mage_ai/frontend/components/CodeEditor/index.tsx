import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as ReactDOM from 'react-dom';
import Editor from '@monaco-editor/react';
import Text from '@oracle/elements/Text';
import usePrevious from '@utils/usePrevious';
import {
  DEFAULT_AUTO_SAVE_INTERVAL,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
} from './constants';
import { MONO_FONT_FAMILY_REGULAR } from '@oracle/styles/fonts/primary';
import { REGULAR_FONT_SIZE as DEFAULT_FONT_SIZE } from '@oracle/styles/fonts/sizes';
import {
  ContainerStyle,
  PlaceholderStyle,
  SINGLE_LINE_HEIGHT,
} from './index.style';
import { addKeyboardShortcut } from './keyboard_shortcuts';
import { calculateHeightFromContent } from './utils';
import { defineTheme } from './utils';
import {
  executeCode,
  saveCode,
} from './keyboard_shortcuts/shortcuts';

export type OnDidChangeCursorPositionParameterType = {
  editorRect: {
    height: number;
    top: number;
  };
  position: {
    lineNumber: number;
  };
};

export type CodeEditorSharedProps = {
  height?: number | string;
  onDidChangeCursorPosition?: (opts: OnDidChangeCursorPositionParameterType) => void;
  selected?: boolean;
  setSelected?: (value: boolean) => void;
  setTextareaFocused?: (value: boolean) => void;
  textareaFocused?: boolean;
};

type CodeEditorProps = {
  autoHeight?: boolean;
  autoSave?: boolean;
  fontSize?: number;
  language?: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  placeholder?: string;
  runBlock: (content: string) => void;
  showLineNumbers?: boolean;
  theme?: any;
  value?: string;
  width?: number | string;
} & CodeEditorSharedProps;

function CodeEditor({
  autoHeight,
  autoSave,
  fontSize = DEFAULT_FONT_SIZE,
  height,
  language,
  onChange,
  onDidChangeCursorPosition,
  onSave,
  placeholder,
  runBlock,
  selected,
  setSelected,
  setTextareaFocused,
  showLineNumbers,
  textareaFocused,
  theme: themeProp,
  value,
  width = '100%',
}: CodeEditorProps) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const refBottomOfEditor = useRef(null);

  const [mounted, setMounted] = useState<boolean>(false);
  const [heightOfContent, setHeightOfContent] = useState(height);
  const [theme, setTheme] = useState(themeProp || DEFAULT_THEME);

  const handleEditorWillMount = useCallback((monaco) => {
    monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
  }, []);

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    const shortcuts = [];

    // Keyboard shortcuts for saving content: Command + S
    if (onSave) {
      shortcuts.push(saveCode(monaco, () => {
        onSave(editor.getValue());
      }));
    }

    shortcuts.push(executeCode(monaco, () => {
      runBlock(editor.getValue());
    }));

    addKeyboardShortcut(monaco, editor, shortcuts);

    editor.getModel().updateOptions({
      tabSize: 4,
    });

    if (autoHeight && !height) {
      editor._domElement.style.height =
        `${calculateHeightFromContent(value || '')}px`;
    }

    editor.onDidFocusEditorWidget(() => {
      setSelected?.(true);
      setTextareaFocused?.(true);
    });

    editor.onDidContentSizeChange(({
      contentHeight,
      contentHeightChanged,
    }) => {
      if (autoHeight && contentHeightChanged) {
        editor._domElement.style.height = `${contentHeight + (SINGLE_LINE_HEIGHT * 2)}px`;
      }
    });

    if (selected && textareaFocused) {
      setTimeout(() => {
        editor.focus();
      }, 1);
    }

    if (onDidChangeCursorPosition) {
      editor.onDidChangeCursorPosition(({
        position: {
          lineNumber,
        },
      }) => {
        const {
          height,
          top,
        } = editor._domElement.getBoundingClientRect();

        onDidChangeCursorPosition({
          editorRect: {
            height: Number(height),
            top: Number(top),
          },
          position: {
            lineNumber: Number(lineNumber),
          },
        });
      });
    }

    setMounted(true);
  }, [
    autoHeight,
    height,
    onDidChangeCursorPosition,
    onSave,
    refBottomOfEditor.current,
    runBlock,
    selected,
    setMounted,
    setSelected,
    setTextareaFocused,
    textareaFocused,
    value,
  ]);

  useEffect(() => {
    defineTheme(DEFAULT_THEME).then(() => {
      setTheme(DEFAULT_THEME);
    });
  }, []);

  useEffect(() => {
    let autoSaveInterval;
    if (autoSave && onSave) {
      autoSaveInterval = setInterval(() => {
        onSave(editorRef.current.getValue());
      }, DEFAULT_AUTO_SAVE_INTERVAL);
    }

    return () => {
      if (autoSave && autoSaveInterval) {
        clearInterval(autoSaveInterval);
      }
    };
  }, [
    autoSave,
    editorRef,
    onSave,
  ]);

  const selectedPrevious = usePrevious(selected);
  const textareaFocusedPrevious = usePrevious(textareaFocused);

  useEffect(() => {
    if (editorRef?.current) {
      if (selected && textareaFocused) {
        setTimeout(() => {
          editorRef.current.focus();
        }, 1);
      } else {
        const textarea = ReactDOM
          .findDOMNode(editorRef.current._domElement)
          // @ts-ignore
          .getElementsByClassName('inputarea')
        textarea[0].blur()
      }
    }
  }, [
    editorRef,
    selected,
    selectedPrevious,
    textareaFocused,
    textareaFocusedPrevious,
  ]);

  return (
    <ContainerStyle
      style={{
        display: mounted ? null : 'none',
      }}
    >
      {placeholder && !value?.length && (
        <PlaceholderStyle>
          <Text monospace muted>
            {placeholder}
          </Text>
        </PlaceholderStyle>
      )}
      <Editor
        beforeMount={handleEditorWillMount}
        height={height}
        language={language || DEFAULT_LANGUAGE}
        onChange={(val: string) => {
          onChange?.(val);
        }}
        onMount={handleEditorDidMount}
        // https://microsoft.github.io/monaco-editor/api/interfaces/monaco.editor.IStandaloneEditorConstructionOptions.html
        options={{
          fontFamily: MONO_FONT_FAMILY_REGULAR,
          fontSize,
          hideCursorInOverviewRuler: true,
          minimap: {
            enabled: false,
          },
          overviewRulerBorder: false,
          renderLineHighlightOnlyWhenFocus: true,
          scrollBeyondLastLine: false,
          // https://microsoft.github.io/monaco-editor/api/interfaces/monaco.editor.IEditorScrollbarOptions.html
          scrollbar: {
            alwaysConsumeMouseWheel: false,
            vertical: 'hidden',
          },
          wordBasedSuggestions: false,
        }}
        theme={theme}
        value={value}
        width={width}
      />
      <div ref={refBottomOfEditor} />
    </ContainerStyle>
  );
}

export default CodeEditor;
