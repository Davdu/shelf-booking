/** Small helper that appends the brand name to the current route meta title */
export const appendToMetaTitle = (title: string | null | undefined) =>
  `${title ? title : "Not found"} | brAIn lab`;
