/**
Intent: By providing Copilot with a structured list of unresolved comments, you bridge the gap between human intent and AI execution. Instead of manually explaining each requested change, this script gives Copilot the exact line numbers, file paths, and context it needs to "see" the feedback through the same lens as the reviewer.

Impact: This turns Copilot from a general coding assistant into a context-aware collaborator that can systematically iterate through a review, applying fixes and refactors with much higher precision.

USAGE: Copy and paste this into your browser console on any GitHub PR or GitLab MR page.

One Small Catch (CORS/Auth) : 
GitLab: This works perfectly because GitLab accepts your session cookie for API calls from the same domain.

GitHub: GitHub has strict CORS and API Rate Limiting for unauthenticated requests. If you are on a private repository, the GitHub fetch might return a 404 or 403 because it doesn't always automatically pass your session cookie to api.github.com.

**/

(async () => {
    const url = window.location.href;
    const isGitHub = url.includes('github.com');
    const isGitLab = url.includes('gitlab') || !!document.querySelector('meta[content*="GitLab"]');

    console.log(`🚀 Starting API-based extraction on ${isGitHub ? 'GitHub' : 'GitLab'}...`);

    let comments = [];

    try {
        if (isGitHub) {
            // Pattern: github.com/{owner}/{repo}/pull/{number}
            const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
            if (!match) throw new Error("Could not parse GitHub URL");
            const [_, owner, repo, pull_number] = match;

            // GitHub REST API for Review Comments (only gets diff-based comments)
            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/comments`, {
                headers: { 'Accept': 'application/vnd.github+json' }
            });
            const data = await response.json();

            // GitHub doesn't have a simple "isResolved" flag in REST; we filter for the latest state
            // Note: For full 'unresolved' logic, GraphQL is better, but REST is easier for a quick console script.
            comments = data.map(c => ({
                file: c.path,
                line: c.line || c.original_line,
                type: c.line ? "New" : "Old/Removed",
                recommendation: c.body
            }));

        } else if (isGitLab) {
            // Pattern: gitlab.com/{path}/-/merge_requests/{iid}
            const projectPath = document.body.getAttribute('data-project-full-path') || 
                                url.split('/-/')[0].split(window.location.host + '/')[1];
            const mrIid = url.match(/merge_requests\/(\d+)/)[1];
            const host = window.location.origin;

            const response = await fetch(`${host}/api/v4/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}/discussions`);
            const discussions = await response.json();

            discussions.forEach(disc => {
                const firstNote = disc.notes[0];
                // Only capture resolvable (code review) and NOT yet resolved comments
                if (firstNote.resolvable && !disc.notes.every(n => n.resolved)) {
                    const pos = firstNote.position;
                    comments.push({
                        file: pos?.new_path || pos?.old_path || "General",
                        line: pos?.new_line || pos?.old_line,
                        type: pos?.new_line ? "New" : "Old/Removed",
                        recommendation: firstNote.body
                    });
                }
            });
        }

        // --- Formatting for Copilot ---
        if (comments.length === 0) {
            console.log("✅ No open review comments found via API.");
            return;
        }

        let output = `### Open Review Comments (${comments.length})\n\n`;
        comments.forEach((c, i) => {
            output += `${i + 1}. **File:** \`${c.file}\` | **Line (${c.type}):** ${c.line}\n`;
            output += `   **Recommendation:** ${c.recommendation}\n\n`;
        });

        console.log(output);
        await navigator.clipboard.writeText(output);
        console.log("%c✅ Copied to clipboard!", "color: green; font-weight: bold;");

    } catch (err) {
        console.error("❌ API Extraction failed:", err);
    }
})();
