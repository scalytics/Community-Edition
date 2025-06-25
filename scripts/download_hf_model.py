#!/usr/bin/env python3
import os
import sys
import json
import argparse
import logging
import requests
from huggingface_hub import HfApi, login, hf_hub_download
from huggingface_hub.utils import GatedRepoError

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("hf_downloader")

def parse_arguments():
    parser = argparse.ArgumentParser(description="Download models from Hugging Face.")
    parser.add_argument("--model_id", type=str, required=True, help="Hugging Face model ID")
    parser.add_argument("--output_dir", type=str, required=True, help="Directory to save the model")
    parser.add_argument("--revision", type=str, default="main", help="Model revision/branch")
    parser.add_argument("--token", type=str, help="Hugging Face API token")
    parser.add_argument("--download_id", type=str, help="Unique ID for progress reporting")
    parser.add_argument("--is_embedding_model", action='store_true', help="Flag to indicate if the model is for embedding")
    return parser.parse_args()

def report_progress(download_id, progress, message):
    """Report download progress via JSON to stdout"""
    if download_id:
        progress_data = {
            "type": "progress",
            "downloadId": download_id,
            "progress": progress,
            "message": message
        }
        print(json.dumps(progress_data))
        sys.stdout.flush()

def download_file_with_progress(url, local_path, download_id, file_name, file_index, total_files, token=None):
    """Download a single file with progress reporting"""
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    try:
        response = requests.get(url, headers=headers, stream=True)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        
        with open(local_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    if total_size > 0:
                        file_progress = (downloaded / total_size) * 100
                        overall_progress = ((file_index - 1) / total_files) * 100 + (file_progress / total_files)
                        
                        report_progress(
                            download_id, 
                            int(overall_progress),
                            f"Downloading {file_name} ({downloaded}/{total_size} bytes)"
                        )
        
        return True
    except Exception as e:
        logger.error(f"Failed to download {file_name}: {e}")
        return False

def main():
    args = parse_arguments()

    if args.token:
        try:
            login(token=args.token, add_to_git_credential=False)
        except Exception as e:
            logger.error(f"Failed to authenticate with Hugging Face Hub: {type(e).__name__}: {str(e)}")
            print(json.dumps({"success": False, "model_id": args.model_id, "error": f"Authentication failed: {str(e)}"}))
            sys.exit(1)

    try:
        api = HfApi()
        
        # Get repository info
        report_progress(args.download_id, 5, "Fetching repository information...")
        
        try:
            repo_info = api.repo_info(repo_id=args.model_id, revision=args.revision, token=args.token)
        except Exception as e:
            logger.error(f"Exception during repo_info: {type(e).__name__}: {str(e)}")
            if "gated" in str(e).lower() or "access" in str(e).lower() or isinstance(e, GatedRepoError):
                logger.error(f"Access to {args.model_id} is gated. Please accept the license on the Hub.")
                print(json.dumps({"success": False, "error": "gated_repo", "model_id": args.model_id}))
                sys.exit(1)
            logger.error(f"Non-gated error during repo_info, re-raising: {str(e)}")
            raise e
        
        # Get list of files to download
        report_progress(args.download_id, 10, "Getting file list...")
        files_to_download = []
        
        for sibling in repo_info.siblings:
            if not sibling.rfilename.startswith('.'):  # Skip hidden files
                files_to_download.append(sibling.rfilename)
        
        if not files_to_download:
            raise Exception("No files found in repository")
        
        total_files = len(files_to_download)
        
        # Download files one by one with progress
        os.makedirs(args.output_dir, exist_ok=True)
        
        for i, filename in enumerate(files_to_download, 1):
            report_progress(args.download_id, 10 + (i-1) * 80 // total_files, f"Downloading file {i}/{total_files}: {filename}")
            
            try:
                # Use hf_hub_download for individual files - it handles authentication and caching properly
                downloaded_path = hf_hub_download(
                    repo_id=args.model_id,
                    filename=filename,
                    revision=args.revision,
                    token=args.token,
                    local_dir=args.output_dir
                )
                
                # Report progress for this file
                progress = 10 + i * 80 // total_files
                report_progress(args.download_id, progress, f"Downloaded {filename}")
                
            except Exception as e:
                logger.error(f"Exception during hf_hub_download for {filename}: {type(e).__name__}: {str(e)}")
                error_str = str(e).lower()
                if ("gated" in error_str or 
                    "access" in error_str or 
                    isinstance(e, GatedRepoError) or
                    "403" in str(e) or
                    "forbidden" in error_str or
                    "fine-grained token settings" in error_str or
                    "enable access to public gated repositories" in error_str):
                    logger.error(f"Access to {args.model_id} is gated. Please accept the license on the Hub or check token permissions.")
                    print(json.dumps({"success": False, "error": "gated_repo", "model_id": args.model_id}))
                    sys.exit(1)
                else:
                    logger.error(f"Failed to download {filename}: {e}")
                    raise e
        
        report_progress(args.download_id, 95, "Processing model configuration...")
        
        is_embedding = args.is_embedding_model or repo_info.pipeline_tag in ['feature-extraction', 'sentence-similarity']

        output_payload = {
            "success": True,
            "model_id": args.model_id,
            "output_dir": args.output_dir,
            "is_embedding_model": is_embedding,
            "pipeline_tag": repo_info.pipeline_tag,
        }
        
        # Try to read config for extra details
        try:
            config_path = os.path.join(args.output_dir, 'config.json')
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = json.load(f)
                output_payload['full_config_on_disk'] = config
                
                # Extract embedding dimension
                if 'hidden_size' in config:
                    output_payload['embedding_dimension'] = config['hidden_size']
                
                # Extract context window information - try multiple possible fields
                context_window = None
                if 'max_position_embeddings' in config:
                    context_window = config['max_position_embeddings']
                elif 'max_sequence_length' in config:
                    context_window = config['max_sequence_length']
                elif 'max_seq_len' in config:
                    context_window = config['max_seq_len']
                elif 'n_positions' in config:
                    context_window = config['n_positions']
                elif 'seq_length' in config:
                    context_window = config['seq_length']
                
                if context_window:
                    output_payload['context_window'] = context_window
                    
                # Extract quantization information if available
                if 'quantization_config' in config:
                    quant_config = config['quantization_config']
                    if 'bits' in quant_config:
                        bits = quant_config['bits']
                        if bits == 4:
                            output_payload['quantization_method'] = 'int4'
                        elif bits == 8:
                            output_payload['quantization_method'] = 'int8'
                    elif 'quant_method' in quant_config:
                        output_payload['quantization_method'] = quant_config['quant_method']
                        
        except Exception as e:
            logger.warning(f"Could not read or parse config.json: {e}")
        
        report_progress(args.download_id, 100, "Download completed successfully!")
        print(json.dumps(output_payload))
        sys.exit(0)

    except GatedRepoError:
        logger.error(f"Access to {args.model_id} is gated. Please accept the license on the Hub.")
        print(json.dumps({"success": False, "error": "gated_repo", "model_id": args.model_id}))
        sys.exit(1)
        
    except Exception as e:
        logger.error(f"An unexpected error occurred during download: {e}", exc_info=True)
        print(json.dumps({"success": False, "model_id": args.model_id, "error": "Download failed."}))
        sys.exit(1)

if __name__ == "__main__":
    main()
