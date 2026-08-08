const profileQuery = new URLSearchParams(window.location.search);
const requestedStatus = profileQuery.get("status");
const requestedSearch = profileQuery.get("q");
const statusFilter = document.querySelector("#status-filter");
const searchInput = document.querySelector("#search-input");

if (statusFilter && requestedStatus) {
  const supported = Array.from(statusFilter.options).some((option) => option.value === requestedStatus);
  if (supported) statusFilter.value = requestedStatus;
}

if (searchInput && requestedSearch) {
  searchInput.value = requestedSearch.slice(0, 140);
}
