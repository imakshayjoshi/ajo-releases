// Virtual scrolling list for large datasets
import React, { useState, useEffect, useRef, useMemo } from 'react';

/**
 * Virtual list component for efficient rendering of large lists
 * Only renders items currently visible in viewport
 */
export function VirtualList({
  items = [],
  renderItem,
  itemHeight = 80,
  containerHeight = 600,
  overscan = 3,
  className = '',
  style = {}
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  const totalHeight = items.length * itemHeight;

  // Calculate visible range
  const { startIndex, endIndex, visibleItems } = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIdx = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    const visible = items.slice(startIdx, endIdx + 1);

    return {
      startIndex: startIdx,
      endIndex: endIdx,
      visibleItems: visible
    };
  }, [scrollTop, itemHeight, containerHeight, items, overscan]);

  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative',
        ...style
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, idx) => {
            const actualIndex = startIndex + idx;
            return (
              <div
                key={item.id || actualIndex}
                style={{
                  height: itemHeight,
                  overflow: 'hidden'
                }}
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for virtual scrolling with dynamic item heights
 */
export function useVirtualScroll(items = [], estimatedItemHeight = 80) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const itemHeightsRef = useRef(new Map());

  const setItemHeight = (index, height) => {
    itemHeightsRef.current.set(index, height);
  };

  const getItemHeight = (index) => {
    return itemHeightsRef.current.get(index) || estimatedItemHeight;
  };

  const getTotalHeight = () => {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      total += getItemHeight(i);
    }
    return total;
  };

  const getVisibleRange = (overscan = 3) => {
    let start = 0;
    let end = 0;
    let currentOffset = 0;

    // Find start index
    for (let i = 0; i < items.length; i++) {
      const height = getItemHeight(i);
      if (currentOffset + height > scrollTop) {
        start = Math.max(0, i - overscan);
        break;
      }
      currentOffset += height;
    }

    // Find end index
    currentOffset = 0;
    for (let i = 0; i < items.length; i++) {
      const height = getItemHeight(i);
      currentOffset += height;
      if (currentOffset > scrollTop + containerHeight) {
        end = Math.min(items.length - 1, i + overscan);
        break;
      }
    }

    if (end === 0) end = items.length - 1;

    return { start, end };
  };

  return {
    scrollTop,
    containerHeight,
    setScrollTop,
    setContainerHeight,
    setItemHeight,
    getItemHeight,
    getTotalHeight,
    getVisibleRange
  };
}
