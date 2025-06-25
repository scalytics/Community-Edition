import apiService from './apiService';

class GithubService {
  // Connect to GitHub account
  async connectAccount(code) {
    try {
      return await apiService.post('/github/connect', { code });
    } catch (error) {
      console.error('Error connecting GitHub account:', error);
      throw error;
    }
  }

  // Disconnect GitHub account
  async disconnectAccount() {
    try {
      return await apiService.post('/github/disconnect');
    } catch (error) {
      console.error('Error disconnecting GitHub account:', error);
      throw error;
    }
  }

  // Get GitHub connection status
  async getConnectionStatus() {
    try {
      return await apiService.get('/github/status');
    } catch (error) {
      console.error('Error getting GitHub connection status:', error);
      throw error;
    }
  }

  // Get repositories
  async getRepositories() {
    try {
      return await apiService.get('/github/repositories');
    } catch (error) {
      console.error('Error fetching repositories:', error);
      throw error;
    }
  }

  // Get repository content
  async getRepositoryContent(owner, repo, path = '') {
    try {
      return await apiService.get(`/github/content?owner=${owner}&repo=${repo}&path=${path}`);
    } catch (error) {
      console.error('Error fetching repository content:', error);
      throw error;
    }
  }

  // Get file content
  async getFileContent(owner, repo, path) {
    try {
      return await apiService.get(`/github/file?owner=${owner}&repo=${repo}&path=${path}`);
    } catch (error) {
      console.error('Error fetching file content:', error);
      throw error;
    }
  }

  // Add a file to the current chat
  async addFileToChatContext(chatId, owner, repo, path, fileName) {
    try {
      return await apiService.post(`/chat/${chatId}/github-files`, { 
        owner, 
        repo, 
        path, 
        fileName 
      });
    } catch (error) {
      console.error('Error adding file to chat context:', error);
      throw error;
    }
  }

  // Get all files added to a chat
  async getChatGithubFiles(chatId) {
    try {
      return await apiService.get(`/chat/${chatId}/github-files`);
    } catch (error) {
      console.error('Error fetching chat GitHub files:', error);
      throw error;
    }
  }

  // Remove a file from chat context
  async removeFileFromChatContext(chatId, fileId) {
    try {
      return await apiService.delete(`/chat/${chatId}/github-files/${fileId}`);
    } catch (error) {
      console.error('Error removing file from chat context:', error);
      throw error;
    }
  }
}

const githubService = new GithubService();
export default githubService;
