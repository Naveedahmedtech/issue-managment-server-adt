


type IssueStatus = "TO DO" | "IN PROGRESS" | "COMPLETED";

function stripHtml(input?: string): string {
  if (!input) return "";
  // Remove tags
  let text = input.replace(/<\/?(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ""); // drop scripts/styles entirely
  text = text.replace(/<[^>]+>/g, "");
  // Convert <br> and block tags that might have been removed without newline
  text = text.replace(/&nbsp;/g, " ");
  // Decode a few common entities fast (fallback if 'he' isn't used)
  const basicEntities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  };
  text = text.replace(/(&amp;|&lt;|&gt;|&quot;|&#39;)/g, (m) => basicEntities[m] || m);

  // If using 'he': text = he.decode(text);
  // Collapse repeated whitespace
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function fmtDate(d?: Date | string | null): string {
  if (!d) return "N/A";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    return new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(dt);
  } catch {
    return String(d);
  }
}

function drawSectionHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  opts?: { icon?: string; color?: string; yPad?: number }
) {
  const { icon = "■", color = "#0E7490", yPad = 8 } = opts || {};
  doc.moveDown(0.6);
  const y = doc.y;
  doc
    .fillColor(color)
    .fontSize(12)
    .text(icon, 50, y);
  doc
    .fillColor("#0F172A")
    .fontSize(16)
    .text(title, 70, y, { underline: false, continued: false });
  doc
    .strokeColor("#E2E8F0")
    .moveTo(50, doc.y + yPad)
    .lineTo(550, doc.y + yPad)
    .stroke();
  doc.moveDown(0.6);
}

function drawBadge(
  doc: PDFKit.PDFDocument,
  label: string,
  color: string,
  bg: string
) {
  const x = doc.x;
  const y = doc.y;
  const paddingX = 6;
  const paddingY = 3;
  doc.save();
  const width = doc.widthOfString(label) + paddingX * 2;
  const height = doc.currentLineHeight() + paddingY; // approx
  doc
    .roundedRect(x, y - 3, width, height, 6)
    .fillColor(bg)
    .fill();
  doc
    .fillColor(color)
    .text(label, x + paddingX, y - 1);
  doc.restore();
  // Move cursor to the end of the badge
  doc.text("", x + width, y);
}

function statusColors(status: IssueStatus) {
  switch (status) {
    case "TO DO":
      return { fg: "#1E293B", bg: "#E2E8F0" };
    case "IN PROGRESS":
      return { fg: "#9333EA", bg: "#F3E8FF" };
    case "COMPLETED":
      return { fg: "#166534", bg: "#DCFCE7" };
    default:
      return { fg: "#1E293B", bg: "#E2E8F0" };
  }
}

function ensureRoom(doc: PDFKit.PDFDocument, minRemaining = 120) {
  const remaining = doc.page.height - doc.y - doc.page.margins.bottom;
  if (remaining < minRemaining) doc.addPage();
}

function drawCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  value: string
) {
  doc
    .save()
    .roundedRect(x, y, w, h, 10)
    .fillColor("#F8FAFC")
    .fill()
    .strokeColor("#E2E8F0")
    .lineWidth(1)
    .roundedRect(x, y, w, h, 10)
    .stroke()
    .fillColor("#64748B")
    .fontSize(10)
    .text(title, x + 12, y + 10);
  doc.fillColor("#0F172A").fontSize(20).text(value, x + 12, y + 28);
  doc.restore();
}

function drawTableHeader(doc: PDFKit.PDFDocument, cols: [string, number][]) {
  doc.save();
  doc.fillColor("#64748B").fontSize(10);
  const startX = 50;
  let x = startX;
  cols.forEach(([label, width]) => {
    doc.text(label.toUpperCase(), x, doc.y, { width, continued: false });
    x += width;
  });
  doc
    .strokeColor("#E2E8F0")
    .moveTo(50, doc.y + 4)
    .lineTo(550, doc.y + 4)
    .stroke();
  doc.moveDown(0.3);
  doc.restore();
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  cols: [string, number][],
  values: (string | { text: string; link?: string })[]
) {
  doc.save();
  doc.fillColor("#0F172A").fontSize(11);
  let x = 50;
  const yStart = doc.y;
  let rowHeight = 0;

  // First pass: measure heights
  values.forEach((v, i) => {
    const w = cols[i][1];
    const t = typeof v === "string" ? v : v.text;
    const h =
      doc.heightOfString(t || "-", { width: w, lineBreak: true }) + 4;
    rowHeight = Math.max(rowHeight, h);
  });

  ensureRoom(doc, rowHeight + 30);

  // Second pass: draw
  values.forEach((v, i) => {
    const w = cols[i][1];
    if (typeof v === "string") {
      doc.text(v || "-", x, yStart, { width: w });
    } else {
      if (v.link) {
        doc
          .fillColor("#2563EB")
          .text(v.text || "-", x, yStart, {
            width: w,
            link: v.link,
            underline: true,
          })
          .fillColor("#0F172A");
      } else {
        doc.text(v.text || "-", x, yStart, { width: w });
      }
    }
    x += w;
  });

  doc
    .strokeColor("#F1F5F9")
    .moveTo(50, yStart + rowHeight)
    .lineTo(550, yStart + rowHeight)
    .stroke();
  doc.y = yStart + rowHeight + 2;
  doc.restore();
}
