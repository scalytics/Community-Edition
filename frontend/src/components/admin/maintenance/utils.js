// CSS for tooltips
export const tooltipStyles = `
  .tooltip-container {
    position: relative;
    display: inline-block;
  }
  
  .tooltip {
    visibility: hidden;
    position: absolute;
    z-index: 1;
    background-color: #374151;
    color: white;
    text-align: center;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    line-height: 1.4;
    width: 200px;
    bottom: 125%;
    left: 50%;
    margin-left: -100px;
    opacity: 0;
    transition: opacity 0.3s;
    font-weight: normal;
    text-transform: none;
  }
  
  .tooltip-container:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }
  
  .tooltip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: #374151 transparent transparent transparent;
  }
`;

export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};
