function toPublicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    userId: String(user._id),
    username: user.username || user.email?.split("@")[0] || "",
    fullName: user.fullName || user.name || "",
    name: user.name || user.fullName || "",
    email: user.email,
    phone: user.phone || "",
    role: user.role || "USER",
    active: user.active !== false,
    location: user.location || "",
    avatarUrl: user.avatarUrl || "",
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

module.exports = {
  toPublicUser: toPublicUser,
};
