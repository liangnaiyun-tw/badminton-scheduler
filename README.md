# Badminton Scheduler (10:10–12:00)

React + Vite + TypeScript + Tailwind 的羽球排程器。自動排雙打、線審/主審，避免連打三場、支援混雙偏好、匯出 CSV、印成 PDF（A4 橫向）。

## 本機執行
```bash
npm i
npm run dev
```

## 打包（拖曳部署到 Netlify）
```bash
npm run build
```
打包完成後，把 `dist/` 整個資料夾拖曳到 https://app.netlify.com/drop 即可。

## 連結 GitHub 自動部署（Netlify）
- 以此專案為範本建立 Repo
- 進 Netlify 連結 Repo，Build command: `npm run build`，Publish directory: `dist`

---

若要改成原生 .xlsx 匯出或增加統計表，請見 `App.tsx` 裡的 `exportScheduleCSV` 與排程邏輯。
