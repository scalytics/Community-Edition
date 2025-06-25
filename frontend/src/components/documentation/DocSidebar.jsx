import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/apiService';

const DocumentationIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const FolderIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const FileIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const DocSidebar = ({ currentDocId }) => {
  const [docsList, setDocsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // Fetch list of available documentation
  useEffect(() => {
    const fetchDocsList = async () => {
      setIsLoading(true);
      try {
        const data = await apiService.get('/docs/list');
        
        if (data && data.docs && Array.isArray(data.docs)) {
          setDocsList(data.docs);
          
          // Process categories
          const categories = {};
          data.docs.forEach(doc => {
            const pathParts = doc.path ? doc.path.split('/') : [];
            const category = pathParts.length > 1 ? pathParts[0] : 'general';
            if (!categories[category]) categories[category] = [];
            categories[category].push(doc);
          });
        } else {
          setError('Invalid documentation data received');
        }
        
        setError(null);
      } catch (err) {
        setError('Failed to load documentation list');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocsList();
  }, []);

  // Handle doc selection
  const handleDocSelect = (id) => {
    const encodedId = encodeURIComponent(id);
    navigate(`/documentation/${encodedId}`);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  // Toggle mobile sidebar
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Group docs by category based on their path
  const groupDocsByCategory = () => {
    const categories = {};
    
    docsList.forEach(doc => {
      // Get the first part of the path as the category
      // If no slash in path, use 'general' as the category
      const pathParts = doc.path ? doc.path.split('/') : [];
      const category = pathParts.length > 1 ? pathParts[0] : 'general';
      
      if (!categories[category]) {
        categories[category] = [];
      }
      
      categories[category].push({
        ...doc,
        displayTitle: doc.title || (pathParts.length ? pathParts[pathParts.length - 1] : doc.id)
      });
    });
    
    // Sort the documents within each category alphabetically by title
    Object.keys(categories).forEach(category => {
      categories[category].sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
    });
    
    return categories;
  };
  
  const docCategories = groupDocsByCategory();

  // Render doc category
  const renderCategory = (category, docs) => (
    <div key={category} className="mb-4">
      <h3 className="font-medium text-gray-600 dark:text-gray-300 text-sm uppercase tracking-wider mb-2 flex items-center">
        <FolderIcon className="h-4 w-4 mr-1 text-gray-500 dark:text-gray-400" /> 
        {category.charAt(0).toUpperCase() + category.slice(1)}
      </h3>
      <ul className="space-y-1 ml-2">
        {docs.map((doc) => (
          <li key={doc.id}>
            <button
              onClick={() => handleDocSelect(doc.id)}
              className={`flex items-center w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                currentDocId === doc.id
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-dark-text-primary font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <FileIcon className={`h-4 w-4 mr-2 ${
                currentDocId === doc.id ? 'text-blue-500 dark:text-dark-link' : 'text-gray-400 dark:text-gray-500'
              }`} />
              <span className="truncate">{doc.displayTitle}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  // Mobile sidebar
  const mobileBar = (
    <>
      <div className="md:hidden p-4 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center text-gray-900 dark:text-dark-text-primary">
          <DocumentationIcon className="h-5 w-5 mr-2 text-blue-500" />
          Documentation
        </h2>
        <button
          onClick={toggleSidebar}
          className="rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {sidebarOpen 
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            }
          </svg>
        </button>
      </div>
      {sidebarOpen && (
        <div className="md:hidden p-4">
          {isLoading ? (
            <div className="flex justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="text-red-500 dark:text-red-400 text-sm p-2">{error}</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(docCategories).map(([category, docs]) => renderCategory(category, docs))}
            </div>
          )}
        </div>
      )}
    </>
  );

  // Desktop sidebar content
  const desktopContent = (
    <div className="hidden md:block p-4">
      <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-900 dark:text-dark-text-primary">
        <DocumentationIcon className="h-5 w-5 mr-2 text-blue-500" />
        Documentation
      </h2>
      {isLoading ? (
        <div className="flex justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="text-red-500 dark:text-red-400 text-sm p-2">{error}</div>
      ) : docsList.length > 0 ? (
        <div className="space-y-4">
          {Object.entries(docCategories).map(([category, docs]) => renderCategory(category, docs))}
        </div>
      ) : (
        <p className="text-gray-500 dark:text-gray-400">No documentation available</p>
      )}
    </div>
  );

  return (
    <div className="bg-white dark:bg-dark-primary rounded-lg shadow overflow-hidden">
      {mobileBar}
      {desktopContent}
    </div>
  );
};

DocSidebar.propTypes = {
  currentDocId: PropTypes.string
};

export default DocSidebar;
