import React, { useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  ReferenceLine 
} from 'recharts';

/**
 * Renders CPU or GPU usage charts with 24h history support
 * Separated from main component to avoid React hooks issues
 * This component is lazy-loaded to ensure all recharts hooks are initialized correctly
 */
const HardwareCharts = ({ type, data }) => {
  // Ensure data is valid
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">No {type} history data available</p>
      </div>
    );
  }
  
  // Format the data to be more efficiently displayed
  // For 24h data we need to sample it to avoid overcrowding the chart
  const chartData = useMemo(() => {
    const MAX_DISPLAY_POINTS = 144; // Every 10 minutes for 24 hours
    
    if (data.length > MAX_DISPLAY_POINTS) {
      // Sample points evenly across the full dataset
      const step = Math.ceil(data.length / MAX_DISPLAY_POINTS);
      return data.filter((_, index) => index % step === 0);
    }
    
    return data;
  }, [data]);
  
  // Calculate average usage for reference line
  const avgUsage = useMemo(() => {
    return data.reduce((sum, point) => sum + (point.usagePercent || 0), 0) / data.length;
  }, [data]);

  // Format timestamp for tooltips and axis labels
  const formatTime = (time) => {
    const date = new Date(time);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Format date for tooltips
  const formatDateForTooltip = (time) => {
    const date = new Date(time);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };
  
  // Custom tooltip to show both date and time
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-dark-primary p-2 border border-gray-200 dark:border-gray-700 rounded shadow-lg">
          <p className="text-xs text-gray-500">{formatDateForTooltip(label)}</p>
          <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
            {`${type === 'cpu' ? 'CPU' : 'GPU'} Usage: ${payload[0].value.toFixed(1)}%`}
          </p>
        </div>
      );
    }
    
    return null;
  };
  
  // Determine if we need to format x-axis differently for 24h data
  const formatXAxis = (time) => {
    const date = new Date(time);
    const hours = date.getHours();
    
    // For 24h data, just show hours at 6-hour intervals
    if (chartData.length > 60) {
      if (hours === 0 || hours === 6 || hours === 12 || hours === 18) {
        return `${hours}:00`;
      }
      return '';
    }
    
    // For shorter periods, show regular time
    return formatTime(time);
  };

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
          <XAxis 
            dataKey="time" 
            tickFormatter={formatXAxis}
            minTickGap={30}
          />
          <YAxis domain={[0, 100]} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <ReferenceLine 
            y={avgUsage} 
            stroke={type === 'cpu' ? "#93c5fd" : "#86efac"} 
            strokeDasharray="3 3" 
            label={{ 
              value: `Avg: ${avgUsage.toFixed(1)}%`, 
              position: 'left',
              fill: type === 'cpu' ? "#3b82f6" : "#10b981",
              fontSize: 12
            }} 
          />
          <Line 
            type="monotone" 
            dataKey="usagePercent" 
            name={`${type === 'cpu' ? 'CPU' : 'GPU'} Usage`} 
            stroke={type === 'cpu' ? '#3b82f6' : '#10b981'} 
            dot={false}
            activeDot={{ r: 6 }} 
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-gray-500 text-center">
        Showing up to 24 hours of {type === 'cpu' ? 'CPU' : 'GPU'} usage data
      </div>
    </div>
  );
};

export default HardwareCharts;
