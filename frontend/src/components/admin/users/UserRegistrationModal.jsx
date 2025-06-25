import React, { useState } from 'react'; 
import ModernAlert from '../../common/ModernAlert';

const ClipboardCopyIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
  </svg>
);

const CheckIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);


const UserRegistrationModal = ({
  newUsername,
  setNewUsername,
  newUserEmail,
  setNewUserEmail,
  handleRegisterUser,
  creatingUser, 
  showRegisterModal, 
  setShowRegisterModal, 
  error, 
  setError, 
  success, 
  registrationStatus,
  resetRegistrationState, 
  registrationLink, 
  emailContent 
}) => {
  const isSuccess = registrationStatus === 'success';
  const isSending = registrationStatus === 'sending';
  const [linkCopied, setLinkCopied] = useState(false);
  const [subjectCopied, setSubjectCopied] = useState(false);
  const [bodyCopied, setBodyCopied] = useState(false);

  const copyToClipboard = async (text, setCopiedState) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedState(true);
      setTimeout(() => setCopiedState(false), 2000); 
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleClose = () => {
    setShowRegisterModal(false);
    resetRegistrationState();
  };

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-8 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 dark:bg-dark-primary opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-dark-primary rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
          <div className="bg-white dark:bg-dark-primary px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 sm:mx-0 sm:h-10 sm:w-10">
                <svg className="h-6 w-6 text-blue-600 dark:text-dark-link" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
                  Register New User
                </h3>
                <div className="mt-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Enter the user's email address and username. A registration link will be sent to this email.
                  </p>

                  {/* Status Messages */}
                  {error && registrationStatus === 'error' && (
                    <ModernAlert
                      type="error"
                      message={error}
                      onDismiss={() => setError('')} 
                    />
                  )}
                  {success && isSuccess && (
                     <ModernAlert
                       type="success"
                       message={success}
                      />
                    )}

                  {/* Show registration details on success */}
                  {isSuccess && registrationLink && (
                    <div className="mt-4 space-y-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Registration Link:</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            readOnly
                            value={registrationLink}
                            className="flex-grow block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 px-2 sm:text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(registrationLink, setLinkCopied)}
                            title="Copy link"
                            className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                          >
                            {linkCopied ? <CheckIcon className="h-4 w-4 text-green-500" /> : <ClipboardCopyIcon className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      {emailContent?.subject && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email Subject:</label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              readOnly
                              value={emailContent.subject}
                              className="flex-grow block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 px-2 sm:text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
                            />
                            <button
                              type="button"
                              onClick={() => copyToClipboard(emailContent.subject, setSubjectCopied)}
                              title="Copy subject"
                              className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                            >
                              {subjectCopied ? <CheckIcon className="h-4 w-4 text-green-500" /> : <ClipboardCopyIcon className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      )}
                      {emailContent?.body && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email Body:</label>
                          <div className="flex items-start space-x-2"> {/* items-start for textarea */}
                            <textarea
                              readOnly
                              rows="4"
                              value={emailContent.body}
                              className="flex-grow block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 px-2 sm:text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 font-mono text-xs" // Smaller font for body
                            />
                            <button
                              type="button"
                              onClick={() => copyToClipboard(emailContent.body, setBodyCopied)}
                              title="Copy body"
                              className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
                            >
                              {bodyCopied ? <CheckIcon className="h-4 w-4 text-green-500" /> : <ClipboardCopyIcon className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hide form inputs on success */}
                  {!isSuccess && (
                    <div className="space-y-4 mt-4"> {/* Added margin top */}
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        if (!isSending && !isSuccess) {
                          handleRegisterUser();
                        }
                      }}>
                        <div className="space-y-4">
                          <div>
                            <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
                            <input
                              type="text"
                              name="username"
                              id="username"
                              value={newUsername}
                              onChange={(e) => setNewUsername(e.target.value)}
                              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary"
                              placeholder="Enter username"
                            />
                          </div>
                          <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email address</label>
                            <input
                              type="email"
                              name="email"
                              id="email"
                              value={newUserEmail}
                              onChange={(e) => setNewUserEmail(e.target.value)}
                              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary"
                              placeholder="user@example.com"
                            />
                          </div>
                          {/* Hidden submit button to enable form submission with Enter key */}
                          <button type="submit" className="hidden">Submit</button>
                        </div>
                      </form>
                    </div>
                  )} {/* End of !isSuccess block */}
                </div> {/* Close mt-4 div */}
              </div> {/* Close text-left div */}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            {isSuccess ? (
              // Only show Close button on success
              <button
                type="button"
                onClick={handleClose}
                className="w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Close
              </button>
            ) : (
              // Show Send and Cancel buttons otherwise
              <>
                <button
                  type="button"
                  onClick={handleRegisterUser}
                  disabled={isSending || creatingUser} // Disable if sending or during API call
                  className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 dark:bg-blue-700 text-base font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 sm:ml-3 sm:w-auto sm:text-sm ${
                    (isSending || creatingUser) ? 'opacity-75 cursor-not-allowed' : ''
                  }`}
                >
                  {isSending ? 'Sending...' : 'Send Registration Link'}
                </button>
                <button
                  type="button"
                  onClick={handleClose} // Cancel also uses handleClose now to reset state
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </>
             )}
           </div>
         </div>
         {/* Removed extra closing div here */}
       </div>
     </div>
  );
};

export default UserRegistrationModal;
