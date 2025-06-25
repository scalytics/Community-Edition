/**
 * Model Processor Registry
 */
import BaseModelProcessor from './BaseModelProcessor';
import LlamaProcessor from './LlamaProcessor';
import MistralProcessor from './MistralProcessor';
import ClaudeProcessor from './ClaudeProcessor';
import PhiProcessor from './PhiProcessor';
import GeminiProcessor from './GeminiProcessor';

const processors = {
  base: new BaseModelProcessor(),
  llama: new LlamaProcessor(),
  mistral: new MistralProcessor(),
  claude: new ClaudeProcessor(),
  phi: new PhiProcessor(),
  gemini: new GeminiProcessor(),
};

export default processors;
