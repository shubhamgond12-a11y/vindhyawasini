# Vindhyawasini Video Mixing Lab website

## Publish with GitHub Pages

This is a static website. The built stylesheet is already included, so GitHub Pages does not need a build action.

1. Create a GitHub repository and upload the site files to the repository root.
2. Do **not** upload `node_modules/`; it is ignored by Git.
3. Keep `index.html` and `assets/css/styles.css` at the repository root and their existing paths. Include `photos/` if you want to keep your photo folder.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**, then select the `main` branch and `/(root)`.
6. Wait for GitHub Pages to publish. The site will be available at `https://<your-github-username>.github.io/<repository-name>/`.

If you change styles in `src/styles.css`, rebuild the production stylesheet before uploading:

```sh
npm install
npm run build:css
```

Upload the updated `assets/css/styles.css` with your changes. `src/`, `package.json`, and `package-lock.json` are only needed if you plan to rebuild the stylesheet later.

## Before publishing

The canonical and Open Graph URLs in `index.html` currently use `https://vindhyawasinimixinglab.com`. If GitHub Pages will be the public address, update those metadata URLs to the published address. If you plan to use that custom domain with GitHub Pages, keep the domain and configure it in **Settings → Pages**.

The fonts, icons, video, and sample gallery photos currently load from external services. Replace the sample photo URLs with your own files under `photos/` when ready.
