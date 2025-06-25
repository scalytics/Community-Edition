import React from 'react';

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  children,
  confirmText = "Confirm",
  cancelText = "Cancel",
  showCancelButton = true,
  confirmButtonClass = "bg-blue-600 hover:bg-blue-700",
  isConfirmDisabled = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Background overlay */}
      <div
        className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="relative inline-block bg-white dark:bg-dark-primary rounded-lg shadow-xl transform transition-all sm:max-w-lg sm:w-full">
        {/* Content */}
        <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div className="sm:flex sm:items-start">
            {/* (Optional) icon could go here */}
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
              <h3
                className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-primary"
                id="modal-title"
              >
                {title}
              </h3>
              <div className="mt-2">
                {typeof message === 'string' ? (
                  <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
                    {message}
                  </p>
                ) : (
                  message
                )}
                {children && <div className="mt-4">{children}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Footer / buttons */}
        <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className={[
              'w-full inline-flex justify-center rounded-md border border-transparent px-4 py-2 font-medium text-base focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm',
              confirmButtonClass,
              isConfirmDisabled && 'opacity-50 cursor-not-allowed',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {confirmText}
          </button>

          {showCancelButton && (
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-dark-border px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
