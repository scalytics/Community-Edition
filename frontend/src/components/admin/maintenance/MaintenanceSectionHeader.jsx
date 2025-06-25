import React from 'react';
import PropTypes from 'prop-types';

const MaintenanceSectionHeader = ({ title, children }) => {
  return (
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-dark-text-primary">{title}</h2>
      <div className="flex space-x-2">
        {children}
      </div>
    </div>
  );
};

MaintenanceSectionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node
};

export default MaintenanceSectionHeader;
