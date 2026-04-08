/**
 * Pagination Utilities
 *
 * Builds RFC 5988-compliant Link headers for paginated responses.
 * This is a standard REST convention that allows clients to navigate
 * result sets without constructing URLs themselves.
 *
 * Example header:
 *   Link: <https://api.example.com/tuktuks?page=2&limit=20>; rel="next",
 *         <https://api.example.com/tuktuks?page=1&limit=20>; rel="prev",
 *         <https://api.example.com/tuktuks?page=5&limit=20>; rel="last",
 *         <https://api.example.com/tuktuks?page=1&limit=20>; rel="first"
 */

/**
 * Sets the Link and X-Total-Count headers on the response.
 *
 * @param {object} res   - Express response object
 * @param {object} req   - Express request object (for host + path)
 * @param {object} meta  - { total, page, limit } from controller
 */
export const setPaginationHeaders = (res, req, { total, page, limit }) => {
  const totalPages = Math.ceil(total / limit);
  const baseUrl = `${req.protocol}://${req.get("host")}${req.path}`;
  const queryParams = { ...req.query }; // copy existing filters

  const buildUrl = (p) => {
    const params = new URLSearchParams({ ...queryParams, page: p, limit });
    return `<${baseUrl}?${params.toString()}>`;
  };

  const links = [];

  if (page < totalPages) links.push(`${buildUrl(page + 1)}; rel="next"`);
  if (page > 1)          links.push(`${buildUrl(page - 1)}; rel="prev"`);
                          links.push(`${buildUrl(1)}; rel="first"`);
  if (totalPages > 0)    links.push(`${buildUrl(totalPages)}; rel="last"`);

  res.setHeader("Link", links.join(", "));
  res.setHeader("X-Total-Count", total);
  res.setHeader("X-Total-Pages", totalPages);
  res.setHeader("X-Current-Page", page);
};
