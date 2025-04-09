import { route } from "lib/route";
import fetch from "node-fetch"

export default route(async function (params, audioBlob: any) {
    let { req, res } = params;
    let response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": "Bearer <API_KEY>"
        },
        body: JSON.stringify({
            model: "accounts/fireworks/models/deepseek-r1",
            max_tokens: 4096*2,
            top_p: 1,
            top_k: 40,
            presence_penalty: 0,
            frequency_penalty: 0,
            temperature: 0.6,
            messages: []
        })
    });
    let json = await response.json() as any;
    let text = json.choices[0].message.content;
    return text;
});