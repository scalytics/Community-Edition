import React, { useState, useEffect, Component } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';
import Sidebar from '../components/common/Sidebar';
import DocSidebar from '../components/documentation/DocSidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: true,  
  theme: 'default',
  securityLevel: 'loose',
  fontSize: 16,
  logLevel: 5,        
  fontFamily: '"Courier New", monospace',  
});

const mermaidStyles = `
  /* Documentation readability improvements */
  .doc-content-container {
    /* max-width: 65ch; /* Optimal line length for readability - REMOVED FOR WIDER VIEW */
    margin: 0 auto;
    color: rgba(55, 65, 81, 1); /* Improved text color for better contrast */
    font-size: 16px; /* Base font size */
    letter-spacing: -0.011em; /* Slightly tighter letter spacing */
  }
  
  .dark .doc-content-container {
    color: rgba(209, 213, 219, 1);
  }
  
  .doc-content-container p {
    line-height: 1.6; /* Better line height for comfortable reading */
    margin-bottom: 1.2em; /* Improved paragraph spacing */
  }
  
  .doc-content-container h1, 
  .doc-content-container h2, 
  .doc-content-container h3, 
  .doc-content-container h4 {
    margin-top: 1.8em; /* Better spacing before headings */
    margin-bottom: 0.8em; /* Better spacing after headings */
    line-height: 1.3; /* Tighter line height for headings */
    font-weight: 600; /* Slightly bolder headings */
  }
  
  .doc-content-container h1 {
    font-size: 1.75em;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 0.3em;
  }
  
  .dark .doc-content-container h1 {
    border-bottom-color: #374151;
  }
  
  .doc-content-container h2 {
    font-size: 1.4em;
  }
  
  .doc-content-container h3 {
    font-size: 1.25em;
  }
  
  .doc-content-container h4 {
    font-size: 1.1em;
  }
  
  .doc-content-container ul, 
  .doc-content-container ol {
    padding-left: 1.5em;
    margin-bottom: 1.2em;
  }
  
  .doc-content-container ul li, 
  .doc-content-container ol li {
    margin-bottom: 0.5em;
    line-height: 1.5;
  }
  
  .doc-content-container ul li::marker {
    color: #6b7280;
  }
  
  .dark .doc-content-container ul li::marker {
    color: #9ca3af;
  }
  
  /* Mermaid diagram styling */
  .mermaid text {
    font-family: "Courier New", monospace !important;
  }
  .mermaid .label {
    font-family: "Courier New", monospace !important;
  }
  .mermaid .nodeLabel {
    font-family: "Courier New", monospace !important;
  }
  
  /* GitHub-style code blocks - more compact */
  .markdown-content pre {
    background-color: #f6f8fa;
    border-radius: 6px;
    padding: 12px; 
    overflow: auto;
    border: none !important;
    margin-top: 1rem !important;
    margin-bottom: 1rem !important;
    font-size: 0.9em; /* Slightly smaller font for code */
    line-height: 1.5;
    white-space: pre-wrap; /* Enable automatic line wrapping */
    word-wrap: break-word; /* Break long words to prevent overflow */
    max-width: 100%; /* Ensure code blocks don't overflow container */
  }
  
  .dark .markdown-content pre {
    background-color: #161b22;
    border: none !important;
  }
  
  /* Special styling for text-only code blocks without language */
  .markdown-content pre code:not([class*="language-"]) {
    white-space: pre-wrap; /* Enable wrapping for plain text code blocks */
    word-break: normal; /* Use normal word breaking rules */
    word-wrap: break-word; /* Ensure words wrap properly */
    line-height: 1.6; /* Slightly more spacing for readability */
  }
  
  .markdown-content code {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.9em; /* Proportional sizing */
  }
  
  /* Better blockquote styling */
  .doc-content-container blockquote {
    border-left: 3px solid #e5e7eb;
    padding-left: 1em;
    color: #6b7280;
    font-style: italic;
    margin: 1.5em 0;
  }
  
  .dark .doc-content-container blockquote {
    border-left-color: #4b5563;
    color: #9ca3af;
  }
  
  /* Copy button styling */
  .code-block-container {
    position: relative;
  }
  
  .copy-button {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 4px;
    background-color: rgba(255, 255, 255, 0.7);
    border-radius: 4px;
    color: #666;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  
  .dark .copy-button {
    background-color: rgba(30, 41, 59, 0.7);
    color: #ccc;
  }
  
  .code-block-container:hover .copy-button {
    opacity: 1;
  }
  
  .copy-button:hover {
    background-color: rgba(255, 255, 255, 0.9);
    color: #333;
  }
  
  .dark .copy-button:hover {
    background-color: rgba(30, 41, 59, 0.9);
    color: #fff;
  }
  
  .copy-button:active {
    transform: scale(0.97);
  }
  
  .copy-success {
    position: absolute;
    top: 8px;
    right: 40px;
    padding: 4px 8px;
    background-color: #4CAF50;
    color: white;
    border-radius: 4px;
    font-size: 12px;
    opacity: 0;
    transform: translateX(10px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  
  .copy-success.visible {
    opacity: 1;
    transform: translateX(0);
  }
`;

// CopyableCodeBlock component with copy-to-clipboard functionality (excludes language identifier)
const CopyableCodeBlock = ({ children, value, language }) => {
  const [showCopied, setShowCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      // Strip language identifier line if present at the start
      let contentToCopy = value;
      // This is what happens when triple backticks and a language name appears at the start
      const languageLinePattern = /^[a-zA-Z0-9_+-]+ *\n/;
      contentToCopy = contentToCopy.replace(languageLinePattern, '');
      
      await navigator.clipboard.writeText(contentToCopy);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };
  
  return (
    <div className="code-block-container">
      {children}
      <button 
        className="copy-button" 
        onClick={handleCopy}
        aria-label="Copy code to clipboard"
        title="Copy to clipboard"
      >
        {/* Simple clipboard icon using SVG */}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <span className={`copy-success ${showCopied ? 'visible' : ''}`}>Copied!</span>
    </div>
  );
};

// Utility to check if markdown content contains mermaid diagrams
const hasMermaidDiagram = (markdown) => {
  if (!markdown) return false;
  
  // Check for code blocks with mermaid language identifier
  if (/```mermaid/i.test(markdown)) return true;
  
  // Check for mermaid-specific syntax patterns within code blocks
  if (/```.*\s*(graph|sequenceDiagram|flowchart|gantt|classDiagram|erDiagram|journey|pie|gitGraph)/i.test(markdown)) return true;
  
  return false;
};

// Error boundary to catch rendering errors with improved logging
class MarkdownErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error rendering markdown:', error);
    console.error('Component stack:', errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 rounded-md">
          <h3 className="font-medium mb-2">Documentation content couldn't be rendered</h3>
          <p>The markdown content couldn't be properly rendered due to a technical error: {this.state.errorMessage}</p>
          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-md overflow-auto">
            <pre className="whitespace-pre-wrap dark:text-dark-text-primary">{this.props.markdownContent}</pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const DocumentationPage = () => {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Trigger mermaid processing when markdown changes and contains diagrams
  useEffect(() => {
    if (markdown && hasMermaidDiagram(markdown)) {
      
      // Allow a small delay for the DOM to update before processing
      const timer = setTimeout(() => {
        try {
          mermaid.contentLoaded();
        } catch (error) {
          console.error("Error processing mermaid diagrams:", error);
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [markdown]);
  
  // If no docId is provided, navigate to index document or first available doc
  useEffect(() => {
    if (!docId) {
      apiService.get('/docs/list')
        .then(data => {
          if (data.docs && data.docs.length > 0) {
            const indexDoc = data.docs.find(doc => doc.id === 'index');
            if (indexDoc) {
              navigate(`/documentation/${indexDoc.id}`);
            } else {
              navigate(`/documentation/${data.docs[0].id}`);
            }
          }
        })
        .catch(error => {
          console.error('Error loading documentation list:', error);
          setError('Failed to load documentation list');
        });
    }
  }, [docId, navigate]);

  // Fetch the markdown content for the selected doc
  useEffect(() => {
    if (!docId) return;

    const fetchDocContent = async () => {
      setLoading(true);
      try {
        const decodedDocId = decodeURIComponent(docId);
        
        // Map old MCP file names to the new Scalytics Connect names
        let docIdToFetch = decodedDocId;
        const fileNameMappings = {
          'developer/mcp-agent-system': 'developer/scalytics-connect-agent-system',
          'admin/mcp-agent-administration': 'admin/scalytics-connect-agent-administration'
        };
        
        // Check if we need to map an old file name to a new one
        if (fileNameMappings[decodedDocId]) {
          docIdToFetch = fileNameMappings[decodedDocId];
        }
        
        // Try to fetch the document content
        let content;
        
        // First attempt with apiService
        try {
          content = await apiService.get(`/docs/${docIdToFetch}`, {}, {
            headers: {
              'Accept': 'text/markdown, text/plain'
            },
            responseType: 'text'
          });
          
          setMarkdown(content);
          setError(null);
          return;
        } catch (apiError) {
          // Fall back to direct fetch if apiService fails
        }
        
        // Second attempt with direct fetch
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/docs/${docIdToFetch}`, {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Accept': 'text/markdown, text/plain'
          }
        });
        
        // Handle response status
        if (!response.ok) {
          // Try fallback to root level if needed
          if (response.status === 404 && docIdToFetch.includes('/')) {
            const rootLevelId = docIdToFetch.split('/').pop();
            
            const rootResponse = await fetch(`/api/docs/${rootLevelId}`, {
              headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                'Accept': 'text/markdown, text/plain'
              }
            });
            
            if (rootResponse.ok) {
              content = await rootResponse.text();
              setMarkdown(content);
              setError(null);
              return;
            }
          }
          
          // If all attempts failed, throw error
          throw new Error(`Failed to fetch documentation: ${docIdToFetch} (${response.status})`);
        }
        
        // Process successful response
        content = await response.text();
        
        // Validate content type
        if (content.trim().startsWith('<!DOCTYPE html>') || content.includes('<html')) {
          setError('Invalid content type received. Expected markdown but got HTML.');
          setMarkdown('# Error: Invalid Content\n\nThe server returned HTML instead of markdown content.');
          return;
        }
        
        // Use the content directly without preprocessing
        setMarkdown(content);
        setError(null);
      } catch (err) {
        console.error('Error fetching documentation:', err);
        setError(`Failed to load documentation: ${docId}. ${err.message}`);
        setMarkdown('');
      } finally {
        setLoading(false);
      }
    };

    fetchDocContent();
  }, [docId]);

  return (
    <Sidebar>
      {/* Insert mermaid styles into the document head */}
      <style>{mermaidStyles}</style>
      
      {/* This div becomes the main content area, which will be split into two columns below */}
      <div className="flex h-full"> {/* Use flex and h-full for the two-column layout */}
        {/* Left Column for DocSidebar (Table of Contents) */}
        <div className="hidden md:flex md:flex-shrink-0"> {/* Hidden on small screens, flex on medium+ */}
          <div className="flex flex-col w-80"> {/* Changed w-64 to w-80 for wider sidebar */}
            <div className="h-0 flex-1 flex flex-col overflow-y-auto py-6 px-4"> {/* Add padding and scrolling */}
              <DocSidebar currentDocId={docId} />
            </div>
          </div>
        </div>

        {/* Right Column for Markdown Content */}
        <div className="flex flex-col w-0 flex-1 overflow-hidden"> {/* Takes remaining width and handles overflow */}
          <div className="relative z-0 flex-1 overflow-y-auto focus:outline-none py-6 px-4 sm:px-6 md:px-8">
            <div className="bg-white dark:bg-dark-primary rounded-lg shadow-md border border-gray-100 dark:border-dark-border p-6 overflow-hidden">
              {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                  </div>
                ) : error ? (
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md">
                    <p>{error}</p>
                  </div>
                ) : (
                  <article className="prose prose-blue dark:prose-invert max-w-none">
                    <MarkdownErrorBoundary markdownContent={markdown}>
                      <div className="markdown-content doc-content-container">
                        {/* ReactMarkdown with mermaid support */}
                        <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-table:w-full prose-table:border-collapse prose-td:border prose-td:border-gray-300 dark:prose-td:border-gray-700 prose-th:border prose-th:border-gray-300 dark:prose-th:border-gray-700 prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-td:p-2 prose-th:p-2 prose-li:mt-1 prose-p:text-base prose-p:leading-relaxed prose-p:mb-3 prose-li:text-base">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              // GitHub-style paragraph handling with specific definition list detection
                              p: ({node, children, ...props}) => {
                                const content = node.children.map(n => n.value || '').join('');
                                
                                // Very specific parameter list detection - ONLY for command line options
                                const isParameterList = 
                                  // Special section followed by options pattern
                                  (/^(Available Options|Essential Parameters|Optional Parameters):/.test(content) && 
                                   content.match(/\n\s*--[a-zA-Z0-9_-]+/)) ||
                                  // Multiple CLI options in a proper pattern
                                  (content.match(/^--[a-zA-Z0-9_-]+/gm)?.length > 1 && 
                                   !content.includes('*') && !content.includes('_') && 
                                   !content.includes('$') && !content.includes('('));
                                
                                // Definition list detection - specific to scripts with descriptions
                                // This is for patterns like: "script.py: Description of what it does"
                                const isDefinitionList = 
                                  // Has multiple lines where each starts with a word, then colon
                                  content.split('\n').filter(line => 
                                    /^[^\s:]+:[^\n]*$/.test(line.trim())
                                  ).length > 0;
                                
                                if (isParameterList) {
                                  // GitHub-style code block for parameters - more compact
                                  return (
                                    <pre className="my-2 whitespace-pre-wrap font-mono p-3 rounded-md text-sm bg-[#f6f8fa] dark:bg-[#161b22]">
                                      {content}
                                    </pre>
                                  );
                                }
                                
                                if (isDefinitionList) {
                                  // Parse the definition list and render it in GitHub style
                                  const items = content.split('\n').map(line => {
                                    if (line.trim() === '') return null;
                                    
                                    // Check if this is a definition line (term: description)
                                    const defMatch = line.trim().match(/^([^\s:]+):\s*(.+)$/);
                                    if (defMatch) {
                                      const [, term, description] = defMatch; // Removed unused '_'
                                      return (
                                        <div key={term} className="flex flex-col mb-1">
                                          <strong className="text-[#24292e] dark:text-[#c9d1d9]">{term}</strong>
                                          <span className="pl-4 text-[#57606a] dark:text-[#8b949e]">{description}</span>
                                        </div>
                                      );
                                    }
                                    
                                    // If it's not a definition, render as regular paragraph
                                    return <span className="mb-1">{line}</span>;
                                  }).filter(Boolean);
                                  
                                  return <div className="my-2">{items}</div>;
                                }
                                
                                // Regular paragraph - preserve children to handle inline code properly
                                return <p {...props}>{children}</p>;
                              },
                              
                              // GitHub-style code block rendering with special handling for single-line code blocks
                              code: ({node, inline, className, children, ...props}) => {
                                const match = /language-(\w+)/.exec(className || '');
                                const language = match ? match[1] : '';
                                const value = String(children).replace(/\n$/, '');
                                
                                // Special handling for mermaid diagrams
                                if (!inline && language === 'mermaid') {
                                  return <div className="mermaid my-6">{value}</div>;
                                }
                                
                                // Handling for inline code (GitHub style)
                                if (inline) {
                                  return (
                                    <code className="px-1 py-0.5 bg-[#f6f8fa] dark:bg-[#161b22] text-[#24292e] dark:text-[#c9d1d9] rounded font-mono text-sm" {...props}>
                                      {value}
                                    </code>
                                  );
                                }
                                
                                // Single-line code blocks without language specification should be treated as inline
                                // This matches GitHub's behavior where single-line code without language is not boxed
                                if (!language && !value.includes("\n")) {
                                  return (
                                    <code className="px-2 py-1 bg-[#f6f8fa] dark:bg-[#161b22] text-[#24292e] dark:text-[#c9d1d9] rounded font-mono text-sm" {...props}>
                                      {value}
                                    </code>
                                  );
                                }
                                
                                // Multi-line code blocks or blocks with language - more compact GitHub-style block with copy button
                                return (
                                  <CopyableCodeBlock value={value} language={language}>
                                    <pre className="my-2 p-3 bg-[#f6f8fa] dark:bg-[#161b22] rounded-md overflow-auto">
                                      <code className="font-mono text-sm text-[#24292e] dark:text-[#c9d1d9]" {...props}>{value}</code>
                                    </pre>
                                  </CopyableCodeBlock>
                                );
                              },
                              
                              // Basic table improvements for responsiveness
                              table: ({node, ...props}) => (
                                <div className="overflow-x-auto my-6">
                                  <table className="w-full border-collapse border border-gray-300 dark:border-dark-border" {...props} />
                                </div>
                              )
                            }}
                          >
                            {markdown}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </MarkdownErrorBoundary>
                  </article>
                )}
              </div> {/* This was the end of the content's white box */}
            </div> {/* This was the end of the right content column */}
          {/*</div>*/} {/* This was the end of the flex h-full container - This line was commented out, it should be active */}
        </div> {/* This was the end of the max-w-7xl container */}
      </div> {/* This is the corrected closing div for the one that starts with <div className="flex h-full"> */}
    </Sidebar>
  );
};

export default DocumentationPage;
