import { NextResponse } from "next/server";
import { DefaultAzureCredential } from "@azure/identity";
import { AIProjectClient } from "@azure/ai-projects";

export async function POST(req: Request) {
    try {
        // 1. Receive the message from the frontend (e.g. "Hello")
        const body = await req.json();
        const { message, conversationId } = body;
        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        // 2. Set up the AI Foundry Project connection
        // We try to pull these from your .env.local if they exist, otherwise we use your fallback strings
        const projectEndpoint = process.env.FOUNDRY_PROJECT_ENDPOINT || "https://demo-cashflow-foundry.services.ai.azure.com/api/projects/demo-cashflow-foundryProject";
        const agentName = process.env.AZURE_OPENAI_AGENT_ID || "cashflow-agent";

        // For ZAVA Agent
        // const agentVersion = "14";

        // For Hartalega Agent
        const agentVersion = "11";

        // Create the AI Project client
        const projectClient = new AIProjectClient(projectEndpoint, new DefaultAzureCredential());
        const openAIClient = projectClient.getOpenAIClient();

        // 3. THREAD MANAGEMENT
        let currentConversationId = conversationId;

        if (!currentConversationId) {
            // No Thread ID exists? Create a brand new Thread!
            const newConversation = await openAIClient.conversations.create({
                items: [{ type: "message", role: "user", content: [{ type: "input_text", text: message }] }]
            });
            currentConversationId = newConversation.id;
        } else {
            // Thread ID already exists? Add this message to it!
            await openAIClient.conversations.items.create(currentConversationId, {
                items: [{ type: "message", role: "user", content: [{ type: "input_text", text: message }] }]
            });
        }

        // Ask your custom agent to generate a response based on the conversation
        let response = await openAIClient.responses.create(
            {
                conversation: currentConversationId,
            },
            {
                body: { agent_reference: { name: agentName, version: agentVersion, type: "agent_reference" } },
            },
        );

        // Poll until the agent finishes processing (status leaves "queued" / "in_progress")
        while (response.status === "queued" || response.status === "in_progress") {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds between polls
            response = await openAIClient.responses.retrieve(response.id);
        }

        // 4. Return the Agent's answer AND the Thread ID back to your frontend
        return NextResponse.json({
            reply: response.output_text,
            conversationId: currentConversationId
        });
    } catch (error) {
        console.error("Error communicating with Foundry Agent:", error);
        return NextResponse.json({ error: "Failed to generate a response" }, { status: 500 });
    }
}