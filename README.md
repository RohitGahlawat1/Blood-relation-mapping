# Blood Relation Mapping — Family Tree

A React app for building and visualizing your family tree: add people, link them as parents, spouses, or children, and see the whole lineage laid out generation by generation.

## Features

- Add a person with name, gender, birth/death year, and notes
- Link people as Parent / Spouse / Child of anyone already in the tree (relationships stay in sync on both sides automatically)
- **Tree view** — generations laid out top to bottom with connecting lines
- **List view** — a simpler scrollable list for small screens
- Click any person to open their detail panel: edit, delete, or quick-add a relative from there
- Search to jump to someone quickly
- Export your tree as JSON (backup) and import it back in
- Data is saved automatically in your browser (`localStorage`), so it's there next time you open the site

## Run it locally

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually `http://localhost:5173`).

## Build for production

```bash
npm run build
npm run preview   # to test the production build locally
```

The output goes to `dist/`, which you can deploy to any static host (Vercel, Netlify, GitHub Pages, etc.).

## Project structure

```
├── index.html
├── package.json
├── vite.config.js
└── src
    ├── main.jsx     # React entry point
    └── App.jsx      # The whole app
```
