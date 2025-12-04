/**
 * API Testing & Debugging Tips
 * Shown during network analysis loading states
 * Can be replaced with API call in the future
 */

export const API_TESTING_TIPS = [
  "🐌 Test on slow 3G networks - your users aren't all on fiber!",
  "🔄 Check what happens when APIs fail - error states matter too!",
  "⚡ Watch for race conditions when firing multiple requests",
  "🔐 Verify auth headers are present - security first!",
  "⏱️ Set timeout thresholds - don't let users wait forever",
  "🌐 Network throttling in DevTools reveals slow-loading issues",
  "❌ Error responses (4xx/5xx) need proper handling - test them!",
  "🔄 Concurrent API calls can cause race conditions - verify order",
  "🔒 Missing auth tokens? Check your request headers carefully",
  "⏳ APIs over 1000ms feel slow - optimize or show loading states",
  "💡 Check network tab: Are you making redundant API calls?",
  "🎯 Status 200 doesn't mean success - validate response body!",
  "🔍 CORS errors? Check your backend headers configuration",
  "⚡ Debounce your API calls - rapid requests kill performance",
  "🧪 Test with real data volumes - small samples hide issues",
  "🎭 Mock failing APIs during development - prepare for worst case",
  "📊 Monitor response sizes - huge payloads slow everything down",
  "🔁 Retry logic is essential - networks fail all the time",
  "🎪 Parallel requests are fast, but watch for server overload",
  "🌍 Test across regions - latency varies wildly by location",
  "🔑 API keys in code? That's a security nightmare waiting to happen",
  "📉 Check memory leaks from unclosed connections",
  "🎨 Pretty error messages > cryptic stack traces for users",
  "🔎 Log request/response pairs - debugging is easier with context"
];

/**
 * Get a random tip from the array
 */
export function getRandomTip(): string {
  return API_TESTING_TIPS[Math.floor(Math.random() * API_TESTING_TIPS.length)];
}
