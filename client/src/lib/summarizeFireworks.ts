export async function summarizeTranscriptFireworks() {
    await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": "Bearer <API_KEY>"
        },
        body: JSON.stringify({
          model: "accounts/fireworks/models/deepseek-r1",
          max_tokens: 4096,
          top_p: 1,
          top_k: 40,
          presence_penalty: 0,
          frequency_penalty: 0,
          temperature: 0.6,
          messages: []
        })
      });
}