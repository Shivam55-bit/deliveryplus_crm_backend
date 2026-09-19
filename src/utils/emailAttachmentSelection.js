const extractAttachmentId = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const nestedId = value._id ?? value.id ?? value.attachmentId;
    return nestedId === null || nestedId === undefined ? '' : String(nestedId).trim();
  }
  return String(value).trim();
};

export const normalizeEmailAttachmentIds = (ids = []) => {
  if (!Array.isArray(ids)) return [];

  return Array.from(new Set(
    ids
      .map((value) => extractAttachmentId(value))
      .filter(Boolean)
  ));
};

export const mergeEmailAttachmentIds = (...groups) => {
  const merged = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const value of group) {
      const id = extractAttachmentId(value);
      if (id && !merged.includes(id)) {
        merged.push(id);
      }
    }
  }
  return merged;
};
