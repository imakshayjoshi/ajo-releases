export function getSourceProvider(item) {
  const name = item?.provider || item?.network || item?.source_name || item?.sourceProvider;
  if (!name) return { name: 'AJO', badge: 'AJO', color: '#2783DE', icon: '▶' };
  const label = String(name).trim();
  return { name: label, badge: label, color: item?.providerColor || '#2783DE', icon: item?.providerIcon || '▶' };
}
