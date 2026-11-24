# The self-hosted models: file name and download address. Sourced by llm-start.sh and download-models.sh.
# model_file NAME / model_url NAME print the values for gemma or mistral.
model_file() {
  case "$1" in
    gemma)   echo "gemma-4-26b-a4b-uncensored-Q4_K_M.gguf" ;;
    mistral) echo "mistral-small-3.2-abliterated-Q4_K_M.gguf" ;;
    *) return 1 ;;
  esac
}
model_url() {
  case "$1" in
    gemma)   echo "https://huggingface.co/llmfan46/gemma-4-26B-A4B-it-ultra-uncensored-heretic-GGUF/resolve/main/gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q4_K_M.gguf" ;;
    mistral) echo "https://huggingface.co/maerong3/Huihui-Mistral-Small-3.2-24B-Instruct-2506-abliterated-Q4_K_M-GGUF/resolve/main/huihui-mistral-small-3.2-24b-instruct-2506-abliterated-q4_k_m.gguf" ;;
    *) return 1 ;;
  esac
}
