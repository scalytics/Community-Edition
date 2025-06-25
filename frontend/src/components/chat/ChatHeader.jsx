import React from 'react';
import PropTypes from 'prop-types';
import SystemPromptTooltip from '../common/SystemPromptTooltip'; 

const ChatHeader = ({
  isEditing,
  newTitle,
  onTitleChange,
  onTitleKeyPress,
  onStartEditing,
  onSaveTitle,
  onCancelEditing,
  renamingInProgress,
  chat,
  model, 
  githubFiles,
  titleInputRef,
  modelService,
  enable_scala_prompt 
}) => {

  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-dark-primary border-b border-gray-200 dark:border-gray-800 px-4 py-3 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between">
          {/* Left side: Title Editing */}
          <div className="flex-1 min-w-0 mr-4"> {/* Added min-w-0 and mr-4 */}
            {isEditing ? (
              <div className="flex items-center">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={newTitle}
                  onChange={onTitleChange}
                  onKeyDown={onTitleKeyPress} // Changed from onKeyPress for better consistency
                  className="text-lg font-medium text-gray-800 dark:text-dark-text-secondary border-b-2 border-blue-500 dark:border-blue-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-300 w-full max-w-md mr-2 bg-transparent px-1"
                  placeholder="Chat title"
                  disabled={renamingInProgress}
                  autoFocus
                />
                <div className="flex space-x-1">
                  <button
                    onClick={onSaveTitle}
                    disabled={renamingInProgress}
                    className="p-1.5 rounded-full text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-700 dark:hover:text-green-300 focus:outline-none transition-colors"
                    title="Save title"
                  >
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={onCancelEditing}
                    disabled={renamingInProgress}
                    className="p-1.5 rounded-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 focus:outline-none transition-colors"
                    title="Cancel"
                  >
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center">
                <h2 className="text-lg font-medium text-gray-800 dark:text-dark-text-secondary mr-2 truncate">{chat?.title || 'New Chat'}</h2> {/* Added truncate */}
                <button
                  onClick={onStartEditing}
                  className="p-1.5 rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none transition-colors flex-shrink-0" // Added flex-shrink-0
                  title="Edit title"
                >
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
              </div>
            )}

            {/* Model Info and System Prompt Row */}
            <div className="flex flex-wrap items-center mt-1 gap-x-3 gap-y-1"> {/* Reduced mt, adjusted gap */}
              {model && (
                <div className="inline-flex items-center text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-dark-primary rounded-full px-2 py-0.5"> {/* Reduced padding */}
                  <svg className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"> {/* Reduced size */}
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  {modelService.formatModelName(model)}
                </div>
              )}

              {/* System Prompt Indicator - Render based on enable_scala_prompt flag */}
              {enable_scala_prompt && (
                   <div
                     className="inline-flex items-center text-xs text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-full px-2 py-0.5 cursor-default" // Use cursor-default if no hover effect needed
                   >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                       <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                     </svg>
                     <span>System Prompt Active</span> {/* Changed text */}
                   </div>
              )}
              {/* End System Prompt Indicator */}

              {githubFiles && githubFiles.length > 0 && ( // Added check for githubFiles existence
                <div className="inline-flex items-center text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-dark-primary rounded-full px-2 py-0.5"> {/* Reduced padding */}
                  <svg className="h-3 w-3 mr-1 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24"> {/* Reduced size */}
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  <span>{githubFiles.length} file{githubFiles.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
          {/* Right side can contain other actions if needed */}
        </div>
      </div>
    </div>
  );
};

ChatHeader.propTypes = {
  isEditing: PropTypes.bool.isRequired,
  newTitle: PropTypes.string.isRequired,
  onTitleChange: PropTypes.func.isRequired,
  onTitleKeyPress: PropTypes.func.isRequired,
  onStartEditing: PropTypes.func.isRequired,
  onSaveTitle: PropTypes.func.isRequired,
  onCancelEditing: PropTypes.func.isRequired,
  renamingInProgress: PropTypes.bool.isRequired,
  chat: PropTypes.object,
  model: PropTypes.object,
  githubFiles: PropTypes.array,
  titleInputRef: PropTypes.object,
  modelService: PropTypes.object.isRequired,
  enable_scala_prompt: PropTypes.bool 
};

ChatHeader.defaultProps = {
  githubFiles: [],
  chat: null,
  model: null,
  titleInputRef: null,
  enable_scala_prompt: false 
};


export default ChatHeader;
