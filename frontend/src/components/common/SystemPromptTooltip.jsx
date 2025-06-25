import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

// Renamed component - Reverted to standard Tailwind styling & hover
const SystemPromptTooltip = ({ text, children, position = 'bottom' }) => {
  // Restore state for hover visibility
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef(null);
  const parentRef = useRef(null);

  // Ensure text is treated as a string, even if null/undefined initially
  const safeText = text || '';

  // Determine if there's actual content to display after trimming
  const hasContent = safeText.trim().length > 0;

  // Use placeholder text if the effective prompt is empty/whitespace
  const displayText = hasContent ? safeText : '(No specific system prompt set)';

  // Basic positioning logic (keep for now)
  useEffect(() => {
    if (isVisible && tooltipRef.current && parentRef.current) {
      const tooltipEl = tooltipRef.current;
      const parentRect = parentRef.current.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      // Reset styles first
      tooltipEl.style.left = '50%';
      tooltipEl.style.right = 'auto';
      tooltipEl.style.transform = 'translateX(-50%)';

      if (tooltipRect.right > viewportWidth - 20) {
        tooltipEl.style.left = 'auto';
        tooltipEl.style.right = '0';
        tooltipEl.style.transform = 'translateX(0)';
        const arrow = tooltipEl.querySelector('[data-tooltip-arrow]');
        if (arrow) {
           const parentCenterOffset = parentRect.width / 2;
           const tooltipWidth = tooltipRect.width;
           arrow.style.left = 'auto';
           arrow.style.right = `${tooltipWidth - parentCenterOffset}px`;
           arrow.style.transform = 'translateX(50%)';
        }
      } else if (tooltipRect.left < 20) {
         tooltipEl.style.left = '0';
         tooltipEl.style.right = 'auto';
         tooltipEl.style.transform = 'translateX(0)';
         const arrow = tooltipEl.querySelector('[data-tooltip-arrow]');
         if (arrow) {
           arrow.style.left = `${parentRect.width / 2}px`;
           arrow.style.transform = 'translateX(-50%)';
         }
      } else {
         const arrow = tooltipEl.querySelector('[data-tooltip-arrow]');
         if (arrow) {
            arrow.style.left = '50%';
            arrow.style.right = 'auto';
            arrow.style.transform = 'translateX(-50%)';
         }
      }
    }
  }, [isVisible]); // Rerun positioning logic when visibility changes

  return (
    // Restore hover handlers
    <div
      ref={parentRef}
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {/* Tooltip renders based on isVisible state */}
      {isVisible && (
        <div
          ref={tooltipRef}
          // Add custom class and keep essential positioning/base styles
          className={`
            system-prompt-tooltip-box {/* ADDED CUSTOM CLASS */}
            absolute z-50 top-full left-1/2 transform -translate-x-1/2 mt-2
            px-3 py-2
            text-white bg-gray-800
            rounded-md shadow-lg
            dark:bg-gray-700
            {/* Removed text-xs, max-w, whitespace - will be handled by custom class */}
          `}
          style={{ minWidth: '200px' }} // Keep min-width
        >
          {/* Render as an unordered list */}
          <ul className="list-none p-0 m-0">
            {displayText.split('\n').map((line, index) => (
              <li key={index} className="py-0.5">{line || '\u00A0'}</li>
            ))}
          </ul>
          {/* Arrow pointing upwards */}
          <div
            data-tooltip-arrow
            className="absolute bottom-full left-1/2 transform -translate-x-1/2
                       w-0 h-0
                       border-x-4 border-x-transparent
                       border-b-4 border-b-gray-800 dark:border-b-gray-700"
          ></div>
        </div>
      )}
    </div>
  );
};

SystemPromptTooltip.propTypes = {
  text: PropTypes.string,
  children: PropTypes.node.isRequired,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right'])
};

export default SystemPromptTooltip;
