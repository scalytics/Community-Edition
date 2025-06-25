// feature => display Librarian for the is_key_summary=True flag, 
// LIBRARIAN_ANALYSIS_COMPLETE_HOP = f"{LIBRARIAN_PREFIX} Hop {{current_hop}} analysis: Learned about {{summary_of_findings}}. Remaining focus: {{gaps_or_next_steps}}."
import React, { useState } from 'react';

const KeySummaryDisplay = ({ summaries }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!summaries || summaries.length === 0) {
    return null;
  }

  const toggleExpansion = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="key-summary-display my-2 p-3 border rounded-lg bg-gray-50 dark:bg-dark-secondary shadow-sm">
      <button
        onClick={toggleExpansion}
        className="w-full flex justify-between items-center text-left font-semibold text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none"
      >
        <span>Key Research Steps ({summaries.length})</span>
        <span className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}>
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </span>
      </button>
      {isExpanded && (
        <ul className="list-disc pl-5 space-y-1 mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
          {summaries.map((summary, index) => (
            <li key={index} className="text-xs text-gray-600 dark:text-gray-400">
              {summary.message}
              {summary.timestamp && (
                <span className="text-gray-400 dark:text-gray-500 text-xxs ml-2">
                  ({new Date(summary.timestamp).toLocaleTimeString()})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default KeySummaryDisplay;
