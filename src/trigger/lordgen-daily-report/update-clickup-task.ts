import { task } from "@trigger.dev/sdk";

export interface UpdateClickUpTaskInput {
  subject: string;
  markdownBody: string;
}

export interface UpdateClickUpTaskOutput {
  updated: true;
  taskUrl: string;
}

// Not a secret — this is the specific ClickUp task this automation keeps in sync
// (LordGen Agency Report list). Hardcoded rather than an env var for the same reason
// the Trigger.dev project ref is: it's an identifier, not a credential.
const CLICKUP_TASK_ID = "86cb4n9hk";

export const updateClickUpTask = task({
  id: "update-clickup-task",
  run: async (input: UpdateClickUpTaskInput): Promise<UpdateClickUpTaskOutput> => {
    const apiToken = process.env.CLICKUP_API_TOKEN;
    if (!apiToken) throw new Error("CLICKUP_API_TOKEN is not set");

    const markdown = `*Automated report, updated daily at 7am WAT — this task always reflects the most recent run.*\n\n---\n\n${input.markdownBody}`;

    const response = await fetch(`https://api.clickup.com/api/v2/task/${CLICKUP_TASK_ID}`, {
      method: "PUT",
      headers: {
        Authorization: apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.subject,
        markdown_content: markdown,
      }),
    });

    if (!response.ok) {
      throw new Error(`ClickUp API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return { updated: true, taskUrl: data.url };
  },
});
