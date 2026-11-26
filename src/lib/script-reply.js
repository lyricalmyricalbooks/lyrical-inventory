// The Google Sheet script answers in JSON, but when its deployment is wrong
// (access not set to "Anyone", an old link, Google's own error page) it sends
// back an HTML page. Reading that with res.json() surfaced the raw parser line
// ("Unexpected token '<'…") to the publisher; this says what to do instead.

export const SCRIPT_PAGE_REPLY =
  "Your Google Sheet script sent back a web page instead of an answer. Open the script link in a browser to check it works, then redeploy it with access set to Anyone.";

/** The reply's JSON object, or a plain error when it is not JSON. */
export async function readScriptJson(res) {
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') throw new Error(SCRIPT_PAGE_REPLY);
  return data;
}
