import React from 'react';
import PropTypes from 'prop-types';

const Logo = ({ size = 'md', showText = false, className = '', asLink = true }) => {
  // Size variations
  const sizes = {
    sm: { width: 160, height: 50 },
    md: { width: 260, height: 80 },
    lg: { width: 350, height: 110 }
  };

  const { width, height } = sizes[size] || sizes.md;

  const logoSvg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={width}
      height={height}
    >
      <defs>
        <linearGradient id="gradientC" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E65100" />
          <stop offset="100%" stopColor="#26C6DA" />
        </linearGradient>
      </defs>

      <path
        d="
        M 150 50
        L 110 50
        C 85 50, 70 70, 70 100
        C 70 130, 85 150, 110 150
        L 150 150
        L 130 130
        L 110 130
        C 95 130, 90 120, 90 100
        C 90 80, 95 70, 110 70
        L 130 70
        Z
      "
        fill="url(#gradientC)"
        stroke="none"
        strokeLinejoin="round"
      />

      <path
        d="M 150 50
       L 110 50
       C 85 50, 70 70, 70 100
       C 70 130, 85 150, 110 150
       L 150 150
       L 130 130
       L 110 130
       C 95 130, 90 120, 90 100
       C 90 80, 95 70, 110 70
       L 130 70
       Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <path
        d="M 150 50
       L 110 50
       C 85 50, 70 70, 70 100
       C 70 130, 85 150, 110 150
       L 150 150
       L 130 130
       L 110 130
       C 95 130, 90 120, 90 100
       C 90 80, 95 70, 110 70
       L 130 70
       Z"
        fill="none"
        stroke="#E65100"
        strokeWidth="3"
        strokeDasharray="500"
        strokeDashoffset="500"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="500"
          to="0"
          dur="6s"
          begin="0s"
          fill="freeze"
        />
      </path>

      <circle r="1.5" fill="#E65100">
        <animateMotion
          path="M 150 50
             L 110 50
             C 85 50, 70 70, 70 100
             C 70 130, 85 150, 110 150
             L 150 150
             L 130 130
             L 110 130
             C 95 130, 90 120, 90 100
             C 90 80, 95 70, 110 70
             L 130 70
             Z"
          dur="6s"
          repeatCount="1"
          begin="0s"
          fill="freeze"
        />
      </circle>

      <g transform="translate(150, 50)">
        <g opacity="0">
          <line x1="0" y1="-8" x2="0" y2="-4" stroke="#FFAB40" strokeWidth="1" />
          <line x1="6" y1="-6" x2="3" y2="-3" stroke="#FFAB40" strokeWidth="1" />
          <line x1="8" y1="0" x2="4" y2="0" stroke="#FFAB40" strokeWidth="1" />
          <line x1="6" y1="6" x2="3" y2="3" stroke="#FFAB40" strokeWidth="1" />
          <line x1="0" y1="8" x2="0" y2="4" stroke="#FFAB40" strokeWidth="1" />
          <line x1="-6" y1="6" x2="-3" y2="3" stroke="#FFAB40" strokeWidth="1" />
          <line x1="-8" y1="0" x2="-4" y2="0" stroke="#FFAB40" strokeWidth="1" />
          <line x1="-6" y1="-6" x2="-3" y2="-3" stroke="#FFAB40" strokeWidth="1" />
          <animate
            attributeName="opacity"
            values="0;1;0"
            keyTimes="0;0.5;1"
            dur="0.5s"
            begin="6s"
            fill="freeze"
          />
          <animateTransform
            attributeName="transform"
            type="scale"
            values="0.5;1.5;1"
            keyTimes="0;0.5;1"
            dur="0.5s"
            begin="6s"
            fill="freeze"
          />
        </g>
        <circle r="0" fill="#FFF3E0">
          <animate
            attributeName="r"
            values="0;3;0"
            keyTimes="0;0.5;1"
            dur="0.5s"
            begin="6s"
            fill="freeze"
          />
        </circle>
      </g>
    </svg>
  );

  // If asLink is true, wrap the SVG in an anchor tag; otherwise, just return the SVG
  return asLink ? (
    <a
      href="https://www.scalytics.io"
      target="_blank"
      rel="noopener noreferrer"
      className={`logo-container ${className} cursor-pointer`}
    >
      {logoSvg}
    </a>
  ) : (
    <div className={`logo-container ${className}`}>
      {logoSvg}
    </div>
  );
};

Logo.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  showText: PropTypes.bool,
  className: PropTypes.string,
  asLink: PropTypes.bool
};

export default Logo;
