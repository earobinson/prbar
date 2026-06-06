use serde::Deserialize;

use crate::models::Match;

#[derive(Debug, thiserror::Error)]
pub enum GitHubError {
    #[error("network error: {0}")]
    Network(String),
    #[error("github returned status {status}: {message}")]
    Status { status: u16, message: String },
    #[error("failed to parse github response: {0}")]
    Parse(String),
}

#[derive(Debug, Deserialize)]
struct ApiError {
    message: String,
}

/// Build a [`GitHubError::Status`] from a non-success response, surfacing
/// GitHub's own error message in the process. This matters for fine-grained
/// tokens: when a token isn't scoped to the organization that owns a repo,
/// GitHub replies `403 Resource not accessible by personal access token`.
/// Without the body, that just looked like an opaque "status 403" and the
/// real cause (wrong token resource owner) stayed hidden.
fn status_error(response: reqwest::blocking::Response) -> GitHubError {
    let status = response.status().as_u16();
    let body = response.text().unwrap_or_default();
    let message = serde_json::from_str::<ApiError>(&body)
        .map(|e| e.message)
        .ok()
        .filter(|m| !m.trim().is_empty())
        .or_else(|| {
            let trimmed = body.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        })
        .unwrap_or_else(|| "no response body".to_string());
    GitHubError::Status { status, message }
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    items: Vec<SearchItem>,
}

#[derive(Debug, Deserialize)]
struct User {
    login: String,
}

#[derive(Debug, Deserialize)]
struct SearchItem {
    number: i64,
    title: String,
    html_url: String,
    updated_at: String,
    repository_url: String,
    #[serde(default)]
    pull_request: Option<serde_json::Value>,
}

/// Derive "owner/name" from a GitHub repository_url such as
/// "https://api.github.com/repos/octocat/hello-world".
fn repository_from_url(repository_url: &str) -> String {
    match repository_url.split_once("/repos/") {
        Some((_, rest)) => rest.to_string(),
        None => repository_url.to_string(),
    }
}

/// Result of pulling sort/order out of a search query.
#[derive(Debug, PartialEq, Eq)]
pub struct SortSpec {
    /// The query with any `sort:`/`order:` qualifiers removed.
    pub query: String,
    /// REST `sort` parameter value (e.g. "updated", "comments").
    pub sort: Option<String>,
    /// REST `order` parameter value ("asc" or "desc").
    pub order: Option<String>,
}

/// Extract GitHub's inline `sort:` / `order:` qualifiers from a search query
/// and translate them into the REST API's separate `sort` and `order`
/// parameters.
///
/// This matters because GitHub's **web** search accepts inline qualifiers
/// like `sort:updated-desc`, but the **REST** `/search/issues` endpoint does
/// not: there, sorting is controlled by the `sort` and `order` query-string
/// parameters, and a literal `sort:updated-desc` inside `q` is treated as a
/// free-text term that matches nothing — silently returning zero results.
///
/// Supported forms:
/// - `sort:updated-desc` → sort=updated, order=desc
/// - `sort:updated-asc`  → sort=updated, order=asc
/// - `sort:updated`      → sort=updated (order defaults to desc server-side)
/// - `order:asc` / `order:desc` (standalone) → order=…
pub fn extract_sort(query: &str) -> SortSpec {
    let mut sort: Option<String> = None;
    let mut order: Option<String> = None;
    let mut kept: Vec<&str> = Vec::new();

    for token in query.split_whitespace() {
        if let Some(value) = token.strip_prefix("sort:") {
            let value = value.trim_matches('"');
            // Split a trailing "-asc"/"-desc" suffix off the sort field.
            match value.rsplit_once('-') {
                Some((field, dir @ ("asc" | "desc"))) if !field.is_empty() => {
                    sort = Some(field.to_string());
                    order = Some(dir.to_string());
                }
                _ => sort = Some(value.to_string()),
            }
            continue;
        }
        if let Some(value) = token.strip_prefix("order:") {
            let value = value.trim_matches('"');
            if value == "asc" || value == "desc" {
                order = Some(value.to_string());
                continue;
            }
        }
        kept.push(token);
    }

    SortSpec {
        query: kept.join(" "),
        sort,
        order,
    }
}

/// Blocking GitHub client. PRBar does not parse search syntax; the query
/// is passed directly to the `/search/issues` endpoint.
pub struct GitHubClient {
    token: String,
    base_url: String,
    client: reqwest::blocking::Client,
}

impl GitHubClient {
    pub fn new(token: impl Into<String>) -> Self {
        Self::with_base_url(token, "https://api.github.com")
    }

    pub fn with_base_url(token: impl Into<String>, base_url: impl Into<String>) -> Self {
        GitHubClient {
            // Trim the token defensively: pasted personal access tokens often
            // carry a trailing space or newline, which would otherwise produce
            // an `Authorization: Bearer <token> ` header that GitHub rejects
            // with 401 — making a perfectly valid token look invalid.
            token: token.into().trim().to_string(),
            base_url: base_url.into().trim_end_matches('/').to_string(),
            client: reqwest::blocking::Client::new(),
        }
    }

    fn request(&self, url: &str) -> reqwest::blocking::RequestBuilder {
        self.client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .header("Authorization", format!("Bearer {}", self.token))
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "PRBar")
    }

    pub fn search_pull_requests(
        &self,
        query_id: &str,
        query: &str,
    ) -> Result<Vec<Match>, GitHubError> {
        // The REST search endpoint does not accept inline `sort:`/`order:`
        // qualifiers in `q` (unlike the website); pull them out and pass them
        // as the dedicated query-string parameters instead.
        let SortSpec {
            query: q,
            sort,
            order,
        } = extract_sort(query);

        let mut url = format!(
            "{}/search/issues?q={}&per_page=100",
            self.base_url,
            urlencoding::encode(&q)
        );
        if let Some(sort) = sort {
            url.push_str(&format!("&sort={}", urlencoding::encode(&sort)));
        }
        if let Some(order) = order {
            url.push_str(&format!("&order={}", urlencoding::encode(&order)));
        }

        let response = self
            .request(&url)
            .send()
            .map_err(|e| GitHubError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(status_error(response));
        }

        let body: SearchResponse = response
            .json()
            .map_err(|e| GitHubError::Parse(e.to_string()))?;

        Ok(body
            .items
            .into_iter()
            .filter(|item| item.pull_request.is_some())
            .map(|item| Match {
                query_id: query_id.to_string(),
                pull_request_id: item.number,
                repository: repository_from_url(&item.repository_url),
                title: item.title,
                url: item.html_url,
                updated_at: item.updated_at,
            })
            .collect())
    }

    /// Validate the token by calling `GET /user`, which works for any
    /// fine-grained token and requires no permissions.
    ///
    /// Returns `Ok(true)` on success, `Ok(false)` when GitHub explicitly
    /// rejects the credentials (401/403), and `Err` for any other failure
    /// (network/TLS/unexpected status) so callers can surface the real
    /// reason instead of reporting a working token as "invalid".
    pub fn validate(&self) -> Result<bool, GitHubError> {
        let url = format!("{}/user", self.base_url);
        let response = self
            .request(&url)
            .send()
            .map_err(|e| GitHubError::Network(e.to_string()))?;
        let status = response.status();
        if status.is_success() {
            Ok(true)
        } else if status.as_u16() == 401 || status.as_u16() == 403 {
            Ok(false)
        } else {
            Err(status_error(response))
        }
    }

    /// Fetch the authenticated user's login (the exact, correctly-cased
    /// username) by calling `GET /user`. This lets PRBar derive the GitHub
    /// username from the token instead of relying on the user to type it,
    /// avoiding mistakes like the wrong letter case.
    pub fn fetch_login(&self) -> Result<String, GitHubError> {
        let url = format!("{}/user", self.base_url);
        let response = self
            .request(&url)
            .send()
            .map_err(|e| GitHubError::Network(e.to_string()))?;
        if !response.status().is_success() {
            return Err(status_error(response));
        }
        let user: User = response
            .json()
            .map_err(|e| GitHubError::Parse(e.to_string()))?;
        Ok(user.login)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc::{self, Receiver};

    #[test]
    fn parses_repository_from_url() {
        assert_eq!(
            repository_from_url("https://api.github.com/repos/octocat/hello-world"),
            "octocat/hello-world"
        );
        assert_eq!(repository_from_url("nonsense"), "nonsense");
    }

    #[test]
    fn extract_sort_pulls_field_and_direction() {
        let spec = extract_sort("is:pr review-requested:beacon archived:false sort:updated-desc");
        assert_eq!(spec.query, "is:pr review-requested:beacon archived:false");
        assert_eq!(spec.sort.as_deref(), Some("updated"));
        assert_eq!(spec.order.as_deref(), Some("desc"));
    }

    #[test]
    fn extract_sort_handles_ascending() {
        let spec = extract_sort("is:pr sort:comments-asc");
        assert_eq!(spec.query, "is:pr");
        assert_eq!(spec.sort.as_deref(), Some("comments"));
        assert_eq!(spec.order.as_deref(), Some("asc"));
    }

    #[test]
    fn extract_sort_field_without_direction() {
        let spec = extract_sort("is:pr sort:updated");
        assert_eq!(spec.query, "is:pr");
        assert_eq!(spec.sort.as_deref(), Some("updated"));
        assert_eq!(spec.order, None);
    }

    #[test]
    fn extract_sort_standalone_order_qualifier() {
        let spec = extract_sort("is:pr order:asc");
        assert_eq!(spec.query, "is:pr");
        assert_eq!(spec.sort, None);
        assert_eq!(spec.order.as_deref(), Some("asc"));
    }

    #[test]
    fn extract_sort_without_sort_is_unchanged() {
        let spec = extract_sort("is:pr review-requested:beacon archived:false");
        assert_eq!(spec.query, "is:pr review-requested:beacon archived:false");
        assert_eq!(spec.sort, None);
        assert_eq!(spec.order, None);
    }

    /// Start a throwaway HTTP server that answers a single request with the
    /// given status line. Returns the base URL and a receiver that yields the
    /// raw request bytes the server saw (so tests can assert on headers).
    fn serve_once(status_line: &'static str) -> (String, Receiver<String>) {
        serve_once_body(status_line, "{}")
    }

    /// Like [`serve_once`] but with a custom JSON response body.
    fn serve_once_body(
        status_line: &'static str,
        body: &'static str,
    ) -> (String, Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 2048];
                let n = stream.read(&mut buf).unwrap_or(0);
                let request = String::from_utf8_lossy(&buf[..n]).to_string();
                let _ = tx.send(request);
                let response = format!(
                    "HTTP/1.1 {status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
            }
        });
        (format!("http://{addr}"), rx)
    }

    fn auth_header(request: &str) -> String {
        request
            .lines()
            .find_map(|l| l.strip_prefix("authorization: "))
            .unwrap_or("")
            .to_string()
    }

    #[test]
    fn validate_is_true_on_success() {
        let (base, _rx) = serve_once("200 OK");
        let client = GitHubClient::with_base_url("tok", base);
        assert!(client.validate().unwrap());
    }

    #[test]
    fn fetch_login_returns_the_correctly_cased_username() {
        let (base, _rx) = serve_once_body("200 OK", r#"{"login":"edward-beacon"}"#);
        let client = GitHubClient::with_base_url("tok", base);
        assert_eq!(client.fetch_login().unwrap(), "edward-beacon");
    }

    #[test]
    fn fetch_login_errors_when_unauthorized() {
        let (base, _rx) = serve_once_body("401 Unauthorized", "{}");
        let client = GitHubClient::with_base_url("tok", base);
        assert!(client.fetch_login().is_err());
    }

    fn request_target(request: &str) -> String {
        request
            .lines()
            .next()
            .and_then(|l| l.split_whitespace().nth(1))
            .unwrap_or("")
            .to_string()
    }

    #[test]
    fn search_translates_inline_sort_to_query_params() {
        // Regression: the user's `sort:updated-desc` qualifier was being sent
        // verbatim inside `q`, which the REST search endpoint treats as a
        // free-text term that matches nothing — silently returning zero PRs.
        // It must instead become `&sort=updated&order=desc`, and `q` must no
        // longer contain the literal `sort:` qualifier.
        let (base, rx) = serve_once("200 OK");
        let client = GitHubClient::with_base_url("tok", base);
        client
            .search_pull_requests(
                "q1",
                "is:pr review-requested:beacon archived:false sort:updated-desc",
            )
            .unwrap();

        let target = request_target(&rx.recv().unwrap());
        assert!(target.contains("sort=updated"), "sort param present: {target}");
        assert!(target.contains("order=desc"), "order param present: {target}");
        // The encoded `q` must not carry the inline qualifier (`sort%3A`).
        assert!(
            !target.contains("sort%3A") && !target.to_lowercase().contains("sort:"),
            "inline sort qualifier stripped from q: {target}"
        );
    }

    #[test]
    fn search_surfaces_github_permission_message_on_403() {
        // A fine-grained token that isn't scoped to the org that owns the
        // repos gets a 403 with this exact message. It must reach the logs so
        // the user knows to widen the token's resource owner, instead of
        // silently appearing as zero results / an opaque status code.
        let (base, _rx) = serve_once_body(
            "403 Forbidden",
            r#"{"message":"Resource not accessible by personal access token","documentation_url":"https://docs.github.com"}"#,
        );
        let client = GitHubClient::with_base_url("tok", base);
        let err = client
            .search_pull_requests("q1", "is:pr review-requested:@me")
            .unwrap_err();
        let rendered = err.to_string();
        assert!(rendered.contains("403"), "status code present: {rendered}");
        assert!(
            rendered.contains("Resource not accessible by personal access token"),
            "github message surfaced: {rendered}"
        );
    }

    #[test]
    fn validate_is_false_when_unauthorized() {
        let (base, _rx) = serve_once("401 Unauthorized");
        let client = GitHubClient::with_base_url("tok", base);
        assert!(!client.validate().unwrap());
    }

    #[test]
    fn validate_is_false_when_forbidden() {
        let (base, _rx) = serve_once("403 Forbidden");
        let client = GitHubClient::with_base_url("tok", base);
        assert!(!client.validate().unwrap());
    }

    #[test]
    fn validate_errors_on_unexpected_status() {
        let (base, _rx) = serve_once("500 Internal Server Error");
        let client = GitHubClient::with_base_url("tok", base);
        assert!(client.validate().is_err());
    }

    #[test]
    fn token_is_trimmed_in_authorization_header() {
        // A pasted token frequently carries surrounding whitespace/newlines.
        // The client must strip them so the Authorization header is exactly
        // "Bearer <token>" — otherwise GitHub returns 401 for a valid token.
        let (base, rx) = serve_once("200 OK");
        let client = GitHubClient::with_base_url("  ghp_validtoken123\n", base);
        assert!(client.validate().unwrap());
        let request = rx.recv().unwrap();
        assert_eq!(auth_header(&request), "Bearer ghp_validtoken123");
    }

    #[test]
    fn untrimmed_token_would_otherwise_differ() {
        // Guards against regressions: the trimmed header must not contain the
        // raw whitespace that caused the "valid token is invalid" bug.
        let (base, rx) = serve_once("200 OK");
        let client = GitHubClient::with_base_url("tok \t", base);
        assert!(client.validate().unwrap());
        let request = rx.recv().unwrap();
        let header = auth_header(&request);
        assert_eq!(header, "Bearer tok");
        assert!(!header.contains("tok "));
    }
}

