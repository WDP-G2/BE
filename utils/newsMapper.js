var FALLBACK_THUMBNAIL =
  "https://images.unsplash.com/photo-1507514604110-ba3347c457f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";

function mapArticle(doc) {
  return {
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    shortDescription: doc.summary || "",
    summary: doc.summary || "",
    content: doc.content || "",
    thumbnail: doc.thumbnail || FALLBACK_THUMBNAIL,
    imageUrl: doc.thumbnail || FALLBACK_THUMBNAIL,
    imagePublicId: doc.imagePublicId || "",
    category: doc.category || "Tin tức",
    author: doc.authorName || "Ban quản trị",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    featured: Boolean(doc.featured),
    status: doc.status || "published",
  };
}

module.exports = {
  FALLBACK_THUMBNAIL: FALLBACK_THUMBNAIL,
  mapArticle: mapArticle,
};
