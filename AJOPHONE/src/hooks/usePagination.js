// Pagination hook for large lists
import { useState, useMemo } from 'react';

/**
 * Pagination hook with configurable page size
 * @param {Array} items - Full list of items
 * @param {number} initialPageSize - Items per page (default: 20)
 * @returns {Object} - Paginated items and controls
 */
export function usePagination(items = [], initialPageSize = 20) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.ceil(items.length / pageSize);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return items.slice(start, end);
  }, [items, currentPage, pageSize]);

  const goToPage = (page) => {
    const safePage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(safePage);
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const reset = () => {
    setCurrentPage(1);
  };

  const loadMore = () => {
    // Load more by increasing page size (infinite scroll pattern)
    setPageSize(prev => prev + initialPageSize);
  };

  return {
    items: paginatedItems,
    currentPage,
    totalPages,
    pageSize,
    totalItems: items.length,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    goToPage,
    nextPage,
    prevPage,
    reset,
    loadMore,
    setPageSize
  };
}
