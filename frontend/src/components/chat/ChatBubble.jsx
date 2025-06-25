import React, { useState, useRef, memo, useMemo, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown';
import DownloadIcon from '../common/icons/DownloadIcon'; 
import mermaid from 'mermaid';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useTheme } from '../../contexts/ThemeContext'; 
import chatService from '../../services/chatService';
import apiService from '../../services/apiService'; 
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import KeySummaryDisplay from './KeySummaryDisplay'; // Added import

const MermaidBlock = memo(({ diagramId, code, theme }) => {
  const [svgDiagram, setSvgDiagram] = useState(null);
  const [error, setError] = useState(null);
  const mermaidContainerRef = useRef(null);

  useEffect(() => {
    const mermaidConfig = {
      startOnLoad: false,
      theme: 'dark', 
      themeVariables: {
        
        textColor: '#E0E0E0', 
        lineColor: '#DCDCDC', 
        arrowheadColor: '#DCDCDC', 
        primaryColor: '#3c3c3c', 
        primaryTextColor: '#E0E0E0',
        primaryBorderColor: '#DCDCDC', 
        secondaryColor: '#2f2f2f', 
        secondaryTextColor: '#E0E0E0',
        secondaryBorderColor: '#C0C0C0', 
        tertiaryColor: '#252525', 
        tertiaryTextColor: '#E0E0E0',
        tertiaryBorderColor: '#B0B0B0',
      }
    };
    mermaid.initialize(mermaidConfig);
  }, []); 

  useEffect(() => {
    if (code && diagramId) {
      if (mermaidContainerRef.current) {
        mermaidContainerRef.current.innerHTML = ''; 
      }
      setSvgDiagram(null); 
      setError(null);

      const renderMermaidDiagram = async () => {
        try {
          const { svg } = await mermaid.render(diagramId, code);
          
          if (typeof svg === 'string') {
            setSvgDiagram(svg);
            setError(null);
          } else {
            console.error("Mermaid render did not return an SVG string:", svg);
            setError("Diagram generation failed: No SVG output from Mermaid.");
            setSvgDiagram(null);
          }
        } catch (e) {
          console.error("Mermaid rendering/parsing error:", e);
          let userFriendlyMessage = "This diagram could not be rendered due to a syntax error.";
          let details = e.message || String(e);
          if (e.str) { 
            details += `\nDetails: ${e.str}`;
          }
          setError(`${userFriendlyMessage}\n\nTechnical details:\n${details}`);
          setSvgDiagram(null);
        }
      };

      renderMermaidDiagram();
    }
  }, [code, diagramId]); 

  if (error) {
    return (
      <div className="mermaid-error p-3 my-2 bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700/60 rounded-md text-xs shadow-sm">
        <p className="font-semibold text-sm mb-1">⚠️ Diagram Error</p>
        <p className="text-xs mb-2">The diagram could not be displayed due to errors in its definition.</p>
        <details className="text-xs">
          <summary className="cursor-pointer hover:underline text-gray-600 dark:text-gray-400">Show Details & Code</summary>
          <pre className="mt-1 whitespace-pre-wrap bg-red-100 dark:bg-red-800/30 p-2 rounded text-xs">{error}</pre>
          <p className="mt-2 font-medium text-gray-700 dark:text-gray-300">Original Code:</p>
          <pre className="whitespace-pre-wrap bg-gray-100 dark:bg-gray-700/50 p-2 mt-1 rounded text-xs">{code}</pre>
        </details>
      </div>
    );
  }

  if (svgDiagram) {
    return <div ref={mermaidContainerRef} className="mermaid-diagram my-2 flex justify-center" dangerouslySetInnerHTML={{ __html: svgDiagram }} />;
  }

  return (
    <div className="mermaid-placeholder p-2 my-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-dark-border rounded text-xs text-center">
      Rendering diagram...
    </div>
  );
});

MermaidBlock.propTypes = {
  diagramId: PropTypes.string.isRequired,
  code: PropTypes.string.isRequired,
  theme: PropTypes.string.isRequired,
};

const ChatBubble = ({ message, isLoading, streamingContent, onSuggestionClick }) => {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [markdownCopied, setMarkdownCopied] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(() =>
    message?.user_feedback_rating === 1 ? 'up' : message?.user_feedback_rating === -1 ? 'down' : null
  );
  const [showFollowUpSuggestions, setShowFollowUpSuggestions] = useState(true);
  const isMounted = useRef(true);
  const contentRef = useRef(null);
  const [downloadableUrl, setDownloadableUrl] = useState(null);
  const [suggestedFilename, setSuggestedFilename] = useState('download');

  // Debug log for keySummaries
  if (message && message.role === 'assistant') {
    console.log('[ChatBubble] Assistant Message ID:', message.id, 'Received Key Summaries:', message.keySummaries, 'IsLoading:', isLoading, 'Has Streaming Content:', !!streamingContent);
  }

  useEffect(() => {
    setShowFollowUpSuggestions(true);
  }, [message?.id, message?.content]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const isCurrentlyStreaming = isLoading && typeof streamingContent === 'string';

  const linkifyUrls = (text) => {
    if (typeof text !== 'string') return text;
    const urlRegex = /(?<!\]\()(?<!\]\(\s*)(?<!`)(https?:\/\/[^\s)]+)(?!`)/g;
    let processedText = text.replace(urlRegex, (url) => `[${url}](${url})`);
    const installRegex = /Install\s+([A-Za-z0-9\s+#]+)\s*\((\s*)(https?:\/\/[^\s)]+)(\s*)\)/g;
    processedText = processedText.replace(installRegex, (match, packageName, leadingSpace, url, trailingSpace) => `Install ${packageName} ([${url}](${url}))`);
    return processedText;
  };

  const processFinalContent = useCallback((content) => {
    const contentString = (typeof content === 'string') ? content : '';
    if (!contentString) return '';
    let processed = contentString;
    processed = processed.replace(/^((?:C\+\+|Java|C#|\.NET|C).*?)[\n\r]+((?:(?:Common Language Runtime|CLR|\(\.NET\)|\.NET).*?):)/gm, '$1 $2');
    processed = processed.replace(/C#/g, 'C♯');
    processed = processed.replace(/<\/?think>/g, '');
    if (processed.startsWith("![Generated Image by") && processed.includes("](data:image")) {
      return processed;
    }
    return linkifyUrls(processed);
  }, []);

  const { mainContent, followUpSuggestions } = useMemo(() => {
    if (!isCurrentlyStreaming && message?.content) {
      const rawContent = message.content;
      const suggestionMarker = '### Further Exploration:';
      const markerIndex = rawContent.indexOf(suggestionMarker);

      if (markerIndex !== -1) {
        const main = rawContent.substring(0, markerIndex);
        const suggestionsText = rawContent.substring(markerIndex + suggestionMarker.length);
        const parsed = suggestionsText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('- ') || line.startsWith('* '))
          .map(line => line.substring(2).trim())
          .filter(Boolean);
        return {
          mainContent: processFinalContent(main),
          followUpSuggestions: parsed,
        };
      }
      return { mainContent: processFinalContent(rawContent), followUpSuggestions: [] };
    }
    return { mainContent: '', followUpSuggestions: [] };
  }, [isCurrentlyStreaming, message?.content, processFinalContent]);


  const finalProcessedContent = mainContent;

  useEffect(() => {
    // Check for downloadable content when message content changes
    if (message?.content) {
      const markdownImageRegex = /!\[.*?\]\((data:image\/[^;]+;base64,[^)]+|https?:\/\/[^\s)]+)\)/g;
      const linkRegex = /\[[^\]]+\]\((https?:\/\/[^\s)]+\.(?:pdf|zip|txt|csv|json|xml|md|py|js|html|css|doc|docx|xls|xlsx|ppt|pptx|mov|mp4|mp3|wav|ogg|tar|gz|7z))\)/gi;
      
      let foundUrl = null;
      let baseFilename = 'download';
      let extension = '';

      // Function to generate a timestamp string
      const getTimestampString = () => {
        return message?.created_at ? new Date(message.created_at).getTime() : Date.now();
      };

      // Check for markdown images first
      const imageMatch = markdownImageRegex.exec(message.content);
      if (imageMatch && imageMatch[1]) {
        foundUrl = imageMatch[1];
        const altTextMatch = /!\[(.*?)\]/.exec(imageMatch[0]);
        baseFilename = (altTextMatch && altTextMatch[1] ? altTextMatch[1].replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') : '') || 'image';
        
        if (foundUrl.startsWith('data:image/png')) extension = '.png';
        else if (foundUrl.startsWith('data:image/jpeg')) extension = '.jpg';
        else if (foundUrl.startsWith('data:image/gif')) extension = '.gif';
        else if (foundUrl.startsWith('data:image/webp')) extension = '.webp';
        else {
          try {
            const urlObj = new URL(foundUrl);
            const pathParts = urlObj.pathname.split('/');
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart.includes('.')) {
              const extFromFile = lastPart.substring(lastPart.lastIndexOf('.')).toLowerCase();
              if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extFromFile)) {
                baseFilename = lastPart.substring(0, lastPart.lastIndexOf('.')); // Use filename without ext
                extension = extFromFile;
              } else {
                extension = extFromFile; // Use other extensions
              }
            } else {
              extension = '.png'; // Default for URLs without clear extension
            }
          } catch (e) { extension = '.png'; }
        }
      } else {
        // If no markdown image, check for direct links to downloadable files
        const linkMatch = linkRegex.exec(message.content);
        if (linkMatch && linkMatch[1]) {
          foundUrl = linkMatch[1];
          try {
            const urlObj = new URL(foundUrl);
            const pathParts = urlObj.pathname.split('/');
            const fullFilenameFromUrl = pathParts[pathParts.length - 1] || 'download_link';
            if (fullFilenameFromUrl.includes('.')) {
                baseFilename = fullFilenameFromUrl.substring(0, fullFilenameFromUrl.lastIndexOf('.'));
                extension = fullFilenameFromUrl.substring(fullFilenameFromUrl.lastIndexOf('.'));
            } else {
                baseFilename = fullFilenameFromUrl;
                // Try to guess extension from mime type if it's a common one, else no extension
                // This part is complex without fetching headers, so we'll rely on URL or add a generic one later if needed
            }
          } catch (e) {
            baseFilename = 'download_link';
          }
        }
      }

      if (foundUrl) {
        // Ensure filename is not too long and add timestamp
        const finalBase = (baseFilename.length > 50 ? baseFilename.substring(0, 50) : baseFilename) || 'download';
        const finalFilename = `${finalBase}-${getTimestampString()}${extension || ''}`;
        setDownloadableUrl(foundUrl);
        setSuggestedFilename(finalFilename);
      } else {
        setDownloadableUrl(null);
        setSuggestedFilename('download');
      }
    } else {
      setDownloadableUrl(null);
      setSuggestedFilename('download');
    }
  }, [message?.content, message?.created_at]);

  const handleDownload = useCallback(() => {
    if (!downloadableUrl) return;

    const link = document.createElement('a');
    link.href = downloadableUrl;
    link.download = suggestedFilename || 'download'; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadableUrl, suggestedFilename]);

  const formatStreamingCodeBlocks = (content) => {
    if (typeof content !== 'string') return content;
    let fixed = content;
    fixed = fixed.replace(/<\/?think>/g, '');
    if (!fixed.includes('```')) return fixed;

    // eslint-disable-next-line
    fixed = fixed.replace(/^(```(?:[a-zA-Z0-9_+-]+)?)([^\n`])/gm, '$1\n$2');   
    fixed = fixed.replace(/([^\n])(\n?```\s*)$/gm, '$1\n```');
    return fixed;
  };

  const isUser = message.role === 'user'; 
  const isSystem = message.role === 'system';

  const copyCodeToClipboard = useCallback((rawCode) => {
    const languageLinePattern = /^[a-zA-Z0-9_+-]+ *\n/;
    const separatorLinePattern = /^\s*={4,}\s*\n/; 
    let codeToCopy = rawCode.replace(languageLinePattern, ''); 
    codeToCopy = codeToCopy.replace(separatorLinePattern, '');
    codeToCopy = codeToCopy.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    navigator.clipboard.writeText(codeToCopy).then(() => {
      setCodeCopied(true);
      setTimeout(() => { if (isMounted.current) setCodeCopied(false); }, 2000);
    }).catch(err => console.error('Failed to copy code:', err));
  }, [isMounted]); 
  
  const codeRenderer = useCallback(({ node, inline, className, children, ...props }) => {
    const codeContent = String(children).replace(/\n$/, '');
    const isBlock = !!className?.startsWith('language-');
    let language = '';

    if (isBlock) {
      const match = /language-(\w+)/.exec(className);
      language = match ? match[1] : 'text';
    }

    if (isBlock && language.toLowerCase() === 'mermaid') {
      if (isCurrentlyStreaming) {
        return (
          <pre className="mermaid-streaming-placeholder my-2 p-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-border rounded text-xs">
            <code className={`language-mermaid`}>{`Diagram will render when complete:\n${codeContent}`}</code>
          </pre>
        );
      }
      const uniqueDiagramId = `mermaid-${message?.id || 'static'}-${Math.random().toString(36).slice(2, 9)}`;
      return <MermaidBlock diagramId={uniqueDiagramId} code={codeContent} theme={theme} />;
    }

    if (isBlock) {
      return (
        <div className="relative group not-prose">
          <button
            onClick={() => copyCodeToClipboard(codeContent)}
            className="absolute top-2 right-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 text-xs"
            title="Copy code"
          >
            {codeCopied ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
          </button>
          <SyntaxHighlighter 
            style={vscDarkPlus} 
            language={language} 
            className="!my-4 !text-sm !leading-relaxed" 
            customStyle={{ 
              background: 'transparent', 
              color: theme === 'dark' ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)', 
              borderRadius: 3, 
              padding: '0.75rem', 
              margin: '0 -0.5rem 16px -0.5rem', 
              width: 'calc(100% + 1rem)', 
              border: 'none', 
              boxShadow: 'none', 
              textShadow: theme === 'dark' ? 'rgba(0, 0, 0, 0.3) 0px 1px' : 'none', 
              fontFamily: '"Fira Code", "Fira Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace', 
              direction: 'ltr', 
              textAlign: 'left', 
              whiteSpace: 'pre', 
              wordSpacing: 'normal', 
              wordBreak: 'normal', 
              lineHeight: 1.5, 
              tabSize: 2, 
              hyphens: 'none', 
              overflow: 'auto' 
            }} 
            PreTag="pre" 
            CodeTag="code" 
            codeTagProps={{ style: { fontFamily: '"Fira Code", "Fira Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace', display: 'block', whiteSpace: 'pre', overflow: 'auto' } }}
          >
            {codeContent}
          </SyntaxHighlighter>
        </div>
      );
    }
    return <code className="not-prose bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-dark-text-secondary px-1 py-0.5 rounded text-xs font-mono" {...props}>{codeContent.trim()}</code>;
  }, [codeCopied, theme, message?.id, isCurrentlyStreaming, copyCodeToClipboard]);

  const reactMarkdownComponents = useMemo(() => ({
    p: ({node, children, ...props}) => <p className="mb-4 last:mb-0" {...props}>{children}</p>,
    h1: ({node, children, ...props}) => <h1 className="text-xl font-bold mb-4 mt-6 border-b border-gray-200 dark:border-dark-border pb-2" {...props}>{children}</h1>,
    h2: ({node, children, ...props}) => <h2 className="text-lg font-bold mb-3 mt-5" {...props}>{children}</h2>,
    h3: ({node, children, ...props}) => <h3 className="text-base font-bold mb-2 mt-4" {...props}>{children}</h3>,
    h4: ({node, children, ...props}) => <h4 className="text-sm font-bold mb-2 mt-3" {...props}>{children}</h4>,
    ul: ({node, children, ...props}) => <ul className="list-disc pl-5 space-y-1 mb-4" {...props}>{children}</ul>,
    ol: ({node, children, ...props}) => <ol className="list-decimal pl-5 space-y-1 mb-4" {...props}>{children}</ol>,
    li: ({node, children, ...props}) => <li className="mb-1" {...props}>{children}</li>,
    blockquote: ({node, children, ...props}) => <blockquote className="border-l-4 border-gray-300 dark:border-dark-border pl-4 italic text-gray-600 dark:text-gray-400 mb-4" {...props}>{children}</blockquote>,
    table: ({node, children, ...props}) => <div className="overflow-x-auto mb-4"><table className="min-w-full border border-gray-200 dark:border-dark-border rounded-md" {...props}>{children}</table></div>,
    thead: ({node, children, ...props}) => <thead className="bg-gray-50 dark:bg-dark-secondary" {...props}>{children}</thead>,
    tbody: ({node, children, ...props}) => <tbody className="divide-y divide-gray-200 dark:divide-dark-border bg-white dark:bg-dark-primary" {...props}>{children}</tbody>,
    tr: ({node, children, ...props}) => <tr className="hover:bg-gray-50 dark:hover:bg-dark-secondary" {...props}>{children}</tr>,
    th: ({node, children, ...props}) => <th className="border border-gray-200 dark:border-dark-border px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider" {...props}>{children}</th>,
    td: ({node, children, ...props}) => <td className="border border-gray-200 dark:border-dark-border px-4 py-2 text-sm" {...props}>{children}</td>,
    hr: () => null, 
    a: ({node, children, ...props}) => <a className={isUser ? 'text-white hover:underline' : 'text-blue-600 dark:text-blue-400 hover:underline'} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,
    img: ({node, src, alt, ...props}) => (
      <img 
        src={src} 
        alt={alt} 
        className="max-w-full h-auto rounded-md my-2 border border-gray-200 dark:border-dark-border shadow-sm" 
        {...props} 
      />
    ),
    code: codeRenderer,
    div: ({node, className, children, ...props}) => {
      if (className === 'deep-search-task-summary') {
        return <div className={`${className} text-xs text-gray-500 dark:text-gray-400 mt-2`} {...props}>{children}</div>;
      }
      if (className === 'deep-search-stats') { 
        return <div className={`${className} text-xs`} {...props}>{children}</div>; 
      }
      return <div className={className} {...props}>{children}</div>;
    },
  }), [codeRenderer, isUser]);

  const copyToClipboard = () => {
    const textToCopy = contentRef.current?.innerText || message.content || '';
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => { if (isMounted.current) setCopied(false); }, 2000);
    }).catch(err => console.error('Failed to copy text:', err));
  };

  const copyMarkdownToClipboard = () => {
    const rawMarkdown = message.content || '';
    navigator.clipboard.writeText(rawMarkdown).then(() => {
      setMarkdownCopied(true);
      setTimeout(() => { if (isMounted.current) setMarkdownCopied(false); }, 2000);
    }).catch(err => console.error('Failed to copy markdown:', err));
  };

  const handleFeedback = async (rating) => {
    const ratingToSend = (feedbackSent === 'up' && rating === 1) || (feedbackSent === 'down' && rating === -1) ? 0 : rating;
    const newState = ratingToSend === 1 ? 'up' : ratingToSend === -1 ? 'down' : null;
    setFeedbackSent(newState);
    try {
      apiService.post(`/chat/messages/${message.id}/feedback`, { rating: ratingToSend });
    } catch (error) {
      console.error("[handleFeedback] Error submitting feedback:", error);
    }
  };

  const renderAttachedFiles = () => {
    if (!message.files || message.files.length === 0) return null;
    return (
      <div className="mt-3 space-y-1">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Attached files:</p>
        <div className="flex flex-wrap gap-2">
          {message.files.map((file) => (
            <div key={file.id} className="flex items-center bg-gray-50 dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-md px-2 py-1 text-xs text-gray-700 dark:text-gray-300">
              <span className="mr-1 flex-shrink-0">{chatService.getFileIcon(file.file_type || file.type)}</span>
              <span className="truncate max-w-[150px]">{file.original_name || file.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!message || typeof message.role !== 'string') {
    console.error('Invalid message prop received in ChatBubble:', message);
    return null;
  }

  const renderFollowUpSuggestions = () => {
    if (!isUser && !isSystem && showFollowUpSuggestions && followUpSuggestions && followUpSuggestions.length > 0 && onSuggestionClick) {
      return (
        <div className="mt-4 pt-3">
          <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Further Exploration:</h4>
          <ul className="space-y-1.5">
            {followUpSuggestions.map((suggestion, index) => (
              <li key={index}>
                <button
                  onClick={() => onSuggestionClick(suggestion)}
                  className="w-full text-left px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  - {suggestion}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setShowFollowUpSuggestions(false)}
            className="mt-3 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Dismiss suggestions
          </button>
        </div>
      );
    }
    return null;
  };


  return (
    <div className={`group relative mb-6 last:mb-0 w-full max-w-3xl mx-auto`}>
      {!isSystem && (
        <div className={`text-xs font-medium mb-1 ${isUser ? 'text-gray-700 dark:text-gray-300 text-left' : 'text-gray-500 dark:text-gray-400 text-left'}`}>
          {isUser ? 'You' : 'Assistant'}
        </div>
      )}

      {isSystem ? (
        <div className="flex flex-col items-center"> 
          {(() => {
            let processedSystemContent = processFinalContent(message.content);
            let personaName = "System Message";
            const personaRegex = /^\[([\w\s-]+(?: - [\w\s-]+)*)\]\s*(.*)/s;
            const match = processedSystemContent.match(personaRegex);
            if (match) {
              personaName = match[1].trim(); 
              processedSystemContent = match[2].trim(); 
            }
            return processedSystemContent && processedSystemContent !== '0' ? (
              <div className="inline-block px-3 py-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30 text-yellow-800 dark:text-yellow-300 text-sm max-w-xl"> {/* System messages can have their own narrower max-width */}
                <div className="font-medium mb-1">{personaName}</div>
                <div className="text-sm">
                  <ReactMarkdown className="prose dark:prose-invert max-w-none prose-sm" components={reactMarkdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {String(processedSystemContent || '')}
                  </ReactMarkdown>
                </div>
              </div>
            ) : null;
          })()}
        </div>
      ) : (
        <div className={`${
          isUser
            ? 'bg-blue-600 dark:bg-blue-700 text-white'
            : 'bg-white dark:bg-dark-primary text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-dark-border'
        } rounded-lg px-4 py-3 shadow-sm w-full relative`}>
          {!isUser && message.keySummaries && message.keySummaries.length > 0 && (
            <KeySummaryDisplay summaries={message.keySummaries} />
          )}
          <div ref={contentRef} className={`max-w-none text-sm ${isUser ? 'text-white' : ''}`}>
            <ReactMarkdown
              className={!isUser ? "prose dark:prose-invert max-w-none prose-sm" : ""}
              components={reactMarkdownComponents}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]} 
              urlTransform={(uri) => uri} 
            >
              {(() => {
                const contentToRender = String(isCurrentlyStreaming ? formatStreamingCodeBlocks(streamingContent) : finalProcessedContent || '');
                if (!isUser && message.id) { 
                }
                return contentToRender;
              })()}
            </ReactMarkdown>
          </div>
          {!isLoading && !isCurrentlyStreaming && renderAttachedFiles()}
          {!isLoading && !isCurrentlyStreaming && !isUser && renderFollowUpSuggestions()}

          {!isUser && (
            <div className="mt-2 pt-2 flex justify-between items-center min-h-[28px]"> 
              {isLoading && (
                <div className="flex items-center space-x-2">
                  <svg fill="#ff7b00" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 animate-pulse-strong">
                    <path d="M76.21 64l.164-16.15h15.24V64l13.847-.443V47.85l14.64-.439v16.145h14.486V47.85h15.324v15.706l15.313.368V47.85h14.643l.14 16.074 4.656.078a7.99 7.99 0 0 1 7.855 8.127l-.069 3.991h16.113v15.764H192.56l.094 13.812h15.907L208 121.091h-15.744l.202 14.523 15.542.64v15.227h-15.625l.184 13.3 15.441.17v14.94h-15.66l-.126 3.94c-.142 4.416-3.837 8.054-8.256 8.127l-4.043.066-.048 16.555h-14.643v-16.097H149.91v16.097h-15.324v-16.097h-14.485v16.097H106.26v-16.097H91.613v16.097H76.374l-.164-16.753h-4.067a7.996 7.996 0 0 1-7.996-7.994v-3.941h-16.36v-14.94h16.36l.236-13.47H47.787v-15.227h16.36V121.09h-16.36v-14.345h16.847V91.99H47.787V77.063h16.596v-4.92c0-4.416 3.58-8.04 8.003-8.095L76.21 64zm3.722 18.052l.579 91.96c.007 1.115.909 2 2.014 1.995l91.836-.375a2.01 2.01 0 0 0 2.005-2.008l.15-91.771a1.984 1.984 0 0 0-1.993-1.996l-92.609.187a1.99 1.99 0 0 0-1.982 2.008z" fillRule="evenodd"></path>
                  </svg>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">Working...</span>
                </div>
              )}
              {!isLoading && <div className="flex-grow"></div>} 

              {!isLoading && finalProcessedContent && (
                <div className="flex items-center space-x-1.5">
                  {downloadableUrl && !isUser && (
                    <div className="relative group/download">
                      <button
                        className="p-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-dark-border text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 shadow-sm"
                        onClick={handleDownload}
                        title="Download"
                      >
                        <DownloadIcon className="w-3.5 h-3.5" />
                      </button>
                       <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover/download:opacity-100 transition-opacity pointer-events-none">
                        Download File
                      </span>
                    </div>
                  )}
                  <div className="relative group/markdown">
                    <button 
                      className="p-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-dark-border text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 shadow-sm" 
                      onClick={copyMarkdownToClipboard} 
                      title="Copy Markdown"
                    >
                      {markdownCopied ? (
                        <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <g strokeWidth="0"></g>
                          <g strokeLinecap="round" strokeLinejoin="round"></g>
                          <g> 
                            <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path> 
                            <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H12H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path> 
                            <path d="M10 12L8 14L10 16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path> 
                            <path d="M14 12L16 14L14 16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path> 
                          </g>
                        </svg>
                      )}
                    </button>
                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover/markdown:opacity-100 transition-opacity pointer-events-none">
                      Copy Markdown
                    </span>
                  </div>
                  <div className="relative group/text">
                    <button 
                      className="p-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-dark-border text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 shadow-sm" 
                      onClick={copyToClipboard} 
                      title="Copy Text"
                    >
                      {copied ? <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>}
                    </button>
                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover/text:opacity-100 transition-opacity pointer-events-none">
                      Copy Text
                    </span>
                  </div>
                  <div className="relative group/positive">
                    <button className={`p-1.5 rounded-full border shadow-sm ${feedbackSent === 'up' ? 'bg-green-100 dark:bg-green-800 border-green-300 dark:border-green-600 text-green-600 dark:text-green-300' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-dark-border text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`} onClick={() => handleFeedback(1)} title="Positive Feedback">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"><rect width="4.2" height="13.296" x="3.25" y="7.201" rx="1.5"/><path d="M7.45 9.526v7.97a3 3 0 0 0 3 3h6.873a2.5 2.5 0 0 0 2.412-1.842l1.958-7.188a2.5 2.5 0 0 0-2.412-3.157h-4.095V4.5a2 2 0 0 0-2-2h-.036a2 2 0 0 0-1.67.9z"/></g></svg>
                    </button>
                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover/positive:opacity-100 transition-opacity pointer-events-none">
                      Positive Feedback
                    </span>
                  </div>
                  <div className="relative group/negative">
                    <button className={`p-1.5 rounded-full border shadow-sm ${feedbackSent === 'down' ? 'bg-red-100 dark:bg-red-800 border-red-300 dark:border-red-600 text-red-600 dark:text-red-300' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-dark-border text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`} onClick={() => handleFeedback(-1)} title="Negative Feedback">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"><rect width="4.2" height="13.296" x="21.25" y="16.799" rx="1.5" transform="rotate(180 21.25 16.8)"/><path d="M17.05 14.475V6.503a3 3 0 0 0-3-3H7.177a2.5 2.5 0 0 0-2.412 1.843l-1.958 7.188a2.5 2.5 0 0 0 2.412 3.157h4.095V19.5a2 2 0 0 0 2 2h.036a2 2 0 0 0 1.67-.9z"/></g></svg>
                    </button>
                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover/negative:opacity-100 transition-opacity pointer-events-none">
                      Negative Feedback
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

ChatBubble.propTypes = {
  message: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    role: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    created_at: PropTypes.string,
    files: PropTypes.array,
    user_feedback_rating: PropTypes.oneOf([-1, 1, null]),
    keySummaries: PropTypes.arrayOf(PropTypes.shape({
      message: PropTypes.string,
      timestamp: PropTypes.string,
    })), // Added prop type
  }).isRequired,
  isLoading: PropTypes.bool,
  streamingContent: PropTypes.string,
  onSuggestionClick: PropTypes.func,
};

export default memo(ChatBubble);
