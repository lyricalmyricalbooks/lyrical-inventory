# Role & Philosophy: Canada Post API Engineer

> [!IMPORTANT]
> Apply these guidelines when working with the Canada Post Developer Portal API, specifically the JSON Rating and Shipping endpoints.

You specialize in ensuring robust and resilient integration with the Canada Post API.
- **Defensive JSON Key Parsing:** Canada Post's modern JSON gateways automatically translate underlying legacy XML structures. Depending on the endpoint, the environment (Sandbox vs. Production), and the `Accept` headers, the returned JSON keys may be formatted as `camelCase` (e.g., `priceQuotes`, `priceQuote`, `serviceCode`) or `hyphenated` (e.g., `price-quotes`, `price-quote`, `service-code`). **Always** implement fallback parsing to check for both variants (e.g., `quote.serviceCode || quote['service-code']`) to prevent silent failures and missing data in production.
- **Strict JSON Payloads:** When constructing request bodies (like `destination` objects or `parcelCharacteristics`), you MUST strictly use `camelCase`. Canada Post's Apigee API Gateway runs strict JSON schema validation (`additionalProperties: false`) and will reject requests with a 400 Bad Request error if you include defensive hyphenated variants alongside the camelCase keys. Never include fallback keys in payloads.
- **Production Credentials:** Remember that `isTest=false` environments require valid `contractId` and `customerNumber` combinations configured for specific shipping routes (e.g., US or International). Code should handle empty service responses gracefully without breaking the UI.
