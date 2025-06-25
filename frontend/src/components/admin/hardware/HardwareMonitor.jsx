import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { systemService } from '../../../services/admin';

// GPU Software info component with enhanced display
const GpuSoftwareInfo = ({ software }) => {
  if (!software) return null;

  return (
    <div className="mt-4 pl-4 border-l-2 border-blue-100 dark:border-blue-900">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        GPU Software & Acceleration
      </h5>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">CUDA Version</p>
          {software.cuda ? (
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              Ready ({software.cuda})
            </p>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Not detected
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Python vLLM</p>
          {/* This could be enhanced to check vLLM version in the future */}
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            Ready (CUDA enabled)
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Inference Engine</p>
            <div className="flex flex-wrap gap-2 mt-1">
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900 text-blue-800 dark:text-blue-200">
                  vLLM
                </span>
            </div>
        </div>
      </div>
    </div>
  );
};

// Simple line chart using HTML/CSS
const SimpleLineChart = ({ data, type }) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">No data available</p>
      </div>
    );
  }

  const MAX_DISPLAY_POINTS = 144;
  let chartData;

  if (data.length > MAX_DISPLAY_POINTS) {
    const step = Math.ceil(data.length / MAX_DISPLAY_POINTS);
    chartData = data.filter((_, index) => index % step === 0).slice(-MAX_DISPLAY_POINTS);
  } else {
    chartData = data;
  }

  const maxValue = Math.max(...chartData.map(point => point.usagePercent || 0), 100);

  return (
    <div className="w-full h-64 relative bg-gray-50 dark:bg-dark-primary border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-xs text-gray-500 py-4">
        <span>100%</span>
        <span>75%</span>
        <span>50%</span>
        <span>25%</span>
        <span>0%</span>
      </div>
      <div className="absolute left-10 right-0 top-0 bottom-0 flex items-end">
        {chartData.map((point, index) => {
          const height = `${(point.usagePercent / maxValue) * 100}%`;
          let color = type === 'cpu' ? 'bg-blue-500' : type === 'memory' ? 'bg-purple-500' : 'bg-green-500';
          return (
            <div key={index} className="flex-1 flex flex-col justify-end mx-px h-full">
              <div
                className={`${color} rounded-t`}
                style={{ height }}
                title={`${new Date(point.time).toLocaleTimeString()}: ${point.usagePercent.toFixed(1)}%`}
              ></div>
            </div>
          );
        })}
      </div>
      <div className="absolute left-10 right-0 top-0 bottom-0 flex flex-col justify-between pointer-events-none">
        {[0, 1, 2, 3, 4].map((_, i) => (
          <div key={i} className="w-full border-t border-gray-200 dark:border-gray-800 flex-1"></div>
        ))}
      </div>
    </div>
  );
};

// Usage statistics panel
const StatsPanel = ({ data }) => {
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const current = data[data.length - 1]?.usagePercent || 0;
  const average = data.reduce((sum, point) => sum + (point.usagePercent || 0), 0) / data.length;
  const peak = Math.max(...data.map(point => point.usagePercent || 0));

  return (
    <div className="grid grid-cols-3 gap-4 mb-4 bg-gray-50 dark:bg-dark-primary border border-gray-200 dark:border-gray-800 rounded-lg p-4">
      <div className="text-center">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Current</p>
        <p className={`text-xl font-bold ${current > 80 ? 'text-red-500' : current > 50 ? 'text-yellow-500' : 'text-green-500'}`}>
          {current.toFixed(1)}%
        </p>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Average</p>
        <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{average.toFixed(1)}%</p>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Peak</p>
        <p className={`text-xl font-bold ${peak > 80 ? 'text-red-500' : peak > 50 ? 'text-yellow-500' : 'text-green-500'}`}>
          {peak.toFixed(1)}%
        </p>
      </div>
    </div>
  );
};

// Main hardware monitor component
const HardwareMonitor = () => {
  const [hardwareInfo, setHardwareInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchHardwareInfo = useCallback(async () => {
    try {
      // Don't set loading to true on background refreshes
      // setLoading(true); 
      setError(null);
      const data = await systemService.getHardwareInfo();
      setHardwareInfo(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const memoryHistoryData = useMemo(() => {
    if (!hardwareInfo?.memory?.history) return [];
    return hardwareInfo.memory.history.map(point => ({
      time: point.time,
      usagePercent: point.usedPercent || 0
    }));
  }, [hardwareInfo?.memory?.history]);

  useEffect(() => {
    fetchHardwareInfo();
    const interval = setInterval(fetchHardwareInfo, 10000);
    return () => clearInterval(interval);
  }, [fetchHardwareInfo]);

  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  if (loading && !hardwareInfo) {
    return <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>;
  }

  if (error && !hardwareInfo) {
    return <div className="text-red-500 p-4">Failed to load hardware information: {error}</div>;
  }

  const renderGpuTab = () => (
    <div className="space-y-6">
      {hardwareInfo?.gpu?.devices?.length > 0 ? (
        <>
          <div className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">Overall GPU Usage History</h3>
            <StatsPanel data={hardwareInfo?.gpu?.history} />
            <SimpleLineChart data={hardwareInfo?.gpu?.history} type="gpu" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hardwareInfo.gpu.devices.map((gpu, index) => (
              <div key={index} className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">{gpu.name || `GPU ${index}`} <span className="text-sm text-gray-500 dark:text-gray-400">(ID: {gpu.id})</span></h4>
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-dark-text-primary">{gpu.type || 'GPU'}</span>
                </div>
                <div className="mb-4 -mt-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Assigned Model</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate" title={gpu.assignedModel || 'Unassigned'}>
                    {gpu.assignedModel || <span className="italic text-gray-500 dark:text-gray-400">Unassigned</span>}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Memory</p>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-1">
                      <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${(gpu.memory.used / gpu.memory.total) * 100 || 0}%` }}></div>
                    </div>
                    <p className="text-right text-xs text-gray-500 dark:text-gray-400">
                      {formatBytes(gpu.memory.used * 1024 * 1024)} / {formatBytes(gpu.memory.total * 1024 * 1024)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Utilization</p>
                     <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-1">
                      <div className="bg-teal-500 h-2.5 rounded-full" style={{ width: `${gpu.utilization || 0}%` }}></div>
                    </div>
                    <p className="text-right text-xs text-gray-500 dark:text-gray-400">{gpu.utilization?.toFixed(1) || '0.0'}%</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Temperature</p>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-1">
                      <div className="bg-red-500 h-2.5 rounded-full" style={{ width: `${gpu.temperature || 0}%` }}></div>
                    </div>
                    <p className="text-right text-xs text-gray-500 dark:text-gray-400">{gpu.temperature || 'N/A'}°C</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-8"><p className="text-gray-500 dark:text-gray-400">No GPU devices detected</p></div>
      )}
    </div>
  );

  const renderCpuTab = () => (
    <div className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg p-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">CPU Usage History</h3>
      <StatsPanel data={hardwareInfo?.cpu?.history} />
      <SimpleLineChart data={hardwareInfo?.cpu?.history} type="cpu" />
    </div>
  );

  const renderMemoryTab = () => (
    <div className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg p-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">Memory Usage History</h3>
      <div className="text-center mb-4">
        <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{formatBytes(hardwareInfo?.memory?.used)}</span>
        <span className="text-gray-500 dark:text-gray-400"> / {formatBytes(hardwareInfo?.memory?.total)}</span>
      </div>
      <StatsPanel data={memoryHistoryData} />
      <SimpleLineChart data={memoryHistoryData} type="memory" />
    </div>
  );

  const renderOverviewTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          <div className="px-4 py-5 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-dark-border"><h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">System Information</h3></div>
          <div className="px-4 py-5 space-y-4">
            <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">Platform</p><p className="text-sm text-gray-900 dark:text-gray-200">{hardwareInfo.system?.platform || 'Unknown'} {hardwareInfo.system?.release || ''}</p></div>
            <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">Hostname</p><p className="text-sm text-gray-900 dark:text-gray-200">{hardwareInfo.system?.hostname || 'Unknown'}</p></div>
            <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">Uptime</p><p className="text-sm text-gray-900 dark:text-gray-200">{hardwareInfo.system?.uptime ? formatUptime(hardwareInfo.system.uptime) : 'Unknown'}</p></div>
            {hardwareInfo.gpu?.software && <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-border"><GpuSoftwareInfo software={hardwareInfo.gpu.software} /></div>}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          <div className="px-4 py-5 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-dark-border"><h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">CPU & Memory</h3></div>
          <div className="px-4 py-5 space-y-4">
            <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">Model</p><p className="text-sm text-gray-900 dark:text-gray-200">{hardwareInfo.cpu?.model || 'N/A'}</p></div>
            <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">Cores</p><p className="text-sm text-gray-900 dark:text-gray-200">{hardwareInfo.cpu?.cores ? `${hardwareInfo.cpu.cores} cores` : 'N/A'}</p></div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Usage</p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-1">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${hardwareInfo.cpu?.usage?.total || 0}%` }}></div>
              </div>
              <p className="text-right text-xs text-gray-500 dark:text-gray-400">{hardwareInfo.cpu?.usage?.total?.toFixed(1) || '0.0'}%</p>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-border">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Memory</p>
              <p className="text-sm text-gray-900 dark:text-gray-200">{formatBytes(hardwareInfo.memory?.total || 0)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Memory Usage</p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-1">
                <div className="bg-purple-600 h-2.5 rounded-full" style={{ width: `${hardwareInfo.memory?.percentUsed || 0}%` }}></div>
              </div>
              <p className="text-right text-xs text-gray-500 dark:text-gray-400">{hardwareInfo.memory?.percentUsed?.toFixed(1) || '0.0'}% ({formatBytes(hardwareInfo.memory?.used || 0)} used)</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-primary border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
          <div className="px-4 py-5 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-dark-border"><h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">GPU Summary</h3></div>
          {hardwareInfo.gpu?.devices?.length > 0 ? (
            <div className="divide-y divide-gray-200 dark:divide-dark-border">
              {hardwareInfo.gpu.devices.map((gpu, index) => (
                <div key={index} className="px-4 py-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-200">{gpu.name} <span className="text-xs text-gray-500">(ID: {gpu.id})</span></p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Mem: {formatBytes(gpu.memory.total * 1024 * 1024)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Model: <span className="font-medium text-gray-700 dark:text-gray-300">{gpu.assignedModel || 'Idle'}</span></p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-5"><p className="text-sm text-gray-500 dark:text-gray-400">No GPU detected.</p></div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Hardware Monitoring</h2>
        <button onClick={() => fetchHardwareInfo()} disabled={loading} className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
          <svg className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>
      {hardwareInfo && (
        <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
          <div className="border-b border-gray-200 dark:border-dark-border">
            <nav className="-mb-px flex space-x-8 px-6 py-3" aria-label="Tabs">
              <button onClick={() => setActiveTab('overview')} className={`whitespace-nowrap py-2 px-3 font-medium text-sm rounded-md ${activeTab === 'overview' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>Overview</button>
              <button onClick={() => setActiveTab('gpu')} className={`whitespace-nowrap py-2 px-3 font-medium text-sm rounded-md ${activeTab === 'gpu' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>GPU</button>
              <button onClick={() => setActiveTab('cpu')} className={`whitespace-nowrap py-2 px-3 font-medium text-sm rounded-md ${activeTab === 'cpu' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>CPU</button>
              <button onClick={() => setActiveTab('memory')} className={`whitespace-nowrap py-2 px-3 font-medium text-sm rounded-md ${activeTab === 'memory' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>Memory</button>
            </nav>
          </div>
          <div className="p-6">
            {activeTab === 'overview' && renderOverviewTab()}
            {activeTab === 'gpu' && renderGpuTab()}
            {activeTab === 'cpu' && renderCpuTab()}
            {activeTab === 'memory' && renderMemoryTab()}
          </div>
        </div>
      )}
    </div>
  );
};

export default HardwareMonitor;
