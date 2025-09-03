import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { join } from "path";
import { unlink } from "fs/promises";
import { PrismaService } from "src/utils/prisma.service";
import { posix as pathPosix } from "path";
import * as PDFDocument from "pdfkit";
// import PDFDocument from 'pdfkit';
import * as path from "path";
import { copyFileSync, promises as fs } from "fs";
import { getISOWeek } from "src/utils/date-utils";
import {
  Prisma,
  User,
  File as ProjectFile,
  Issue,
  ProjectChecklist,
  ProjectChecklistItem,
} from "@prisma/client";
import { randomUUID } from "crypto";

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Utils
  // ─────────────────────────────────────────────────────────────────────────────
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      !!value && Object.prototype.toString.call(value) === "[object Object]"
    );
  }

  private applyHeaderFooterAfterContent(
    doc: PDFKit.PDFDocument,
    projectTitle: string,
  ) {
    const dtFmt = new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Preserve global cursor just in case some PDFKit builds still tweak x/y
    const globalX = (doc as any).x;
    const globalY = (doc as any).y;

    const pages = doc.bufferedPageRange(); // { start, count }
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);

      // Compute geometry
      const left = doc.page.margins.left ?? 50;
      const right = (doc.page.width ?? 595) - (doc.page.margins.right ?? 50);
      const topY = doc.page.margins.top ?? 50;
      const botY = (doc.page.height ?? 842) - (doc.page.margins.bottom ?? 50);

      // Header rule
      doc.save();
      doc
        .moveTo(left, topY - 8)
        .lineTo(right, topY - 8)
        .lineWidth(0.5)
        .strokeColor("#E0E3E7")
        .stroke();
      doc.restore();

      // Header title — single line, absolutely positioned, NO line break
      doc.save();
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#202124")
        .text(projectTitle || "Project", left, Math.max(2, topY - 30), {
          width: Math.max(10, right - left),
          lineBreak: false, // ← critical: never flow
          continued: false, // ← don’t chain into next text()
          // height is optional; including it can further prevent flow:
          height: 16,
        });
      doc.restore();

      // Footer rule
      doc.save();
      doc
        .moveTo(left, botY)
        .lineTo(right, botY)
        .lineWidth(0.5)
        .strokeColor("#E0E3E7")
        .stroke();
      doc.restore();

      const pageLabel = `Page ${i + 1}`;
      const stamp = dtFmt.format(new Date());

      // Footer left — single line
      doc.save();
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#5F6368")
        .text(pageLabel, left, botY + 10, {
          width: (right - left) / 2,
          lineBreak: false,
          continued: false,
          height: 12,
          align: "left",
        });
      doc.restore();

      // Footer right — single line
      doc.save();
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#5F6368")
        .text(stamp, left + (right - left) / 2, botY + 10, {
          width: (right - left) / 2,
          lineBreak: false,
          continued: false,
          height: 12,
          align: "right",
        });
      doc.restore();
    }

    // Restore global cursor so nothing after this is affected (paranoia)
    (doc as any).x = globalX;
    (doc as any).y = globalY;
  }

  /** Minimal HTML → text converter (keeps line breaks) */
  private stripHtml(input?: string | null): string {
    if (!input) return "";
    const noTags = input
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<\/p>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?[^>]+(>|$)/g, "");
    return noTags
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\u00A0/g, " ")
      .trim();
  }

  /** Safe public URL for a stored filePath */
  private buildPublicUrl(base: string | undefined, filePath: string): string {
    const origin = (base && base.trim()) || "http://localhost:3000/";
    const safeBase = origin.endsWith("/") ? origin : origin + "/";
    const cleanPath = (filePath || "").replace(/^\/+/, "");
    const encoded = cleanPath
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    try {
      return new URL(encoded, safeBase).toString();
    } catch {
      return `${safeBase}${encoded}`;
    }
  }

  /** Ensure there’s space left; otherwise add a page */
  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
    if (!needed || needed <= 0) return;
    const bottom = doc.page.margins.bottom ?? 50;
    const pageH = doc.page.height ?? 842;
    if (doc.y + needed > pageH - bottom) doc.addPage();
  }

  private drawSectionHeading(doc: PDFKit.PDFDocument, title: string): void {
    this.ensureSpace(doc, 40);
    const left = doc.page.margins.left ?? 50;
    const right = (doc.page.width ?? 595) - (doc.page.margins.right ?? 50);
    const width = right - left;

    const y = doc.y;
    doc.save();
    doc.rect(left, y, 6, 22).fill("#4285F4").restore(); // accent
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor("#202124")
      .text(`  ${title}`, left + 6, y);
    doc.moveDown(1);
    doc.save();
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .lineWidth(0.5)
      .strokeColor("#E0E3E7")
      .stroke();
    doc.restore();
    doc.moveDown(0.4);
  }

  private drawStatusChip(doc: PDFKit.PDFDocument, label: string): void {
    const padX = 8,
      padY = 4;
    const text = String(label ?? "").toUpperCase();
    doc.font("Helvetica-Bold").fontSize(10);

    let bg = "#E8F0FE",
      fg = "#1A73E8";
    if (/COMPLETED|DONE|CLOSED/.test(text)) {
      bg = "#E6F4EA";
      fg = "#137333";
    } else if (/IN PROGRESS|WIP|ACTIVE/.test(text)) {
      bg = "#FEF7E0";
      fg = "#B06000";
    } else if (/TO DO|OPEN|BACKLOG/.test(text)) {
      bg = "#E8F0FE";
      fg = "#1A73E8";
    } else if (/BLOCKED/.test(text)) {
      bg = "#FCE8E6";
      fg = "#C5221F";
    }

    const x = doc.x,
      y = doc.y;
    const w = doc.widthOfString(text) + padX * 2;
    const h = doc.currentLineHeight() + padY * 2;

    doc.save();
    doc.roundedRect(x, y - padY, w, h, 6).fill(bg);
    doc.fillColor(fg).text(text, x + padX, y);
    doc.restore();
    doc.moveDown(0.7);
  }

  private tableHeaderCell(
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    width: number,
    align: "left" | "center" | "right" = "left",
  ) {
    doc.save();
    doc
      .fillColor("#5F6368")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(text, x, y + 6, { width, align });
    doc.restore();
  }

  private tableBodyCell(
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    width: number,
    align: "left" | "center" | "right" = "left",
  ) {
    doc.save();
    doc
      .fillColor("#202124")
      .font("Helvetica")
      .fontSize(10)
      .text(text, x, y + 6, { width, align });
    doc.restore();
  }

  private bindHeaderFooter(doc: PDFKit.PDFDocument, projectTitle: string) {
    const dtFmt = new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    let pageIndex = 1;
    let drawing = false; // re-entrancy guard

    const draw = () => {
      if (drawing) return;
      drawing = true;

      try {
        // Save current text cursor so header/footer don't affect flow
        const prevX = (doc as any).x;
        const prevY = (doc as any).y;

        const left = doc.page.margins.left ?? 50;
        const rightX = (doc.page.width ?? 595) - (doc.page.margins.right ?? 50);
        const topY = doc.page.margins.top ?? 50;
        const botY = (doc.page.height ?? 842) - (doc.page.margins.bottom ?? 50);

        // ── Header (absolute positions; no moveDown)
        doc.save();
        doc
          .moveTo(left, topY - 8)
          .lineTo(rightX, topY - 8)
          .lineWidth(0.5)
          .strokeColor("#E0E3E7")
          .stroke();
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#202124")
          .text(projectTitle || "Project", left, topY - 30, {
            width: rightX - left,
            lineBreak: false,
          });
        doc.restore();

        // ── Footer
        const pageLabel = `Page ${pageIndex}`;
        const stamp = dtFmt.format(new Date());

        doc.save();
        // footer rule
        doc
          .moveTo(left, botY)
          .lineTo(rightX, botY)
          .lineWidth(0.5)
          .strokeColor("#E0E3E7")
          .stroke();

        // left footer text
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#5F6368")
          .text(pageLabel, left, botY + 10, {
            width: (rightX - left) / 2,
            align: "left",
            lineBreak: false,
          });

        // right footer text
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#5F6368")
          .text(stamp, left + (rightX - left) / 2, botY + 10, {
            width: (rightX - left) / 2,
            align: "right",
            lineBreak: false,
          });
        doc.restore();

        // restore text cursor so content flow is unaffected
        (doc as any).x = prevX;
        (doc as any).y = prevY;
      } finally {
        drawing = false;
      }
    };

    // Draw for the first (auto) page
    draw();

    // Draw for subsequent pages (guarded)
    doc.on("pageAdded", () => {
      pageIndex += 1;
      draw();
    });
  }

  // Minimal HTML renderer for PDFKit (keeps common editor tags)
  /** Minimal rich-text renderer for common editor HTML (no deps). */
  private renderEditorHtml(
    doc: PDFKit.PDFDocument,
    html: string,
    x: number,
    width: number,
    opts?: { fontSize?: number; lineGap?: number; color?: string },
  ) {
    const input = (html || "").replace(/\r\n?/g, "\n").trim();
    if (!input) return;

    const fontSize = opts?.fontSize ?? 11;
    const lineGap = opts?.lineGap ?? 2;
    const baseColor = opts?.color ?? "#202124";

    type Tok =
      | { t: "open"; tag: string; attrs: Record<string, string> }
      | { t: "close"; tag: string }
      | { t: "text"; text: string };

    const tokens: Tok[] = [];
    const attrRe = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;

    // Tiny tokenizer (good enough for editor HTML)
    input.split(/(<[^>]+>)/).forEach((chunk) => {
      if (!chunk) return;
      if (chunk[0] === "<") {
        const close = /^<\s*\/\s*([\w:-]+)\s*>$/i.exec(chunk);
        if (close) {
          tokens.push({ t: "close", tag: close[1].toLowerCase() });
          return;
        }
        const open =
          /^<\s*([\w:-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*\/?\s*>$/i.exec(
            chunk,
          );
        if (open) {
          const tag = open[1].toLowerCase();
          const attrs: Record<string, string> = {};
          const attrStr = open[2] || "";
          let m: RegExpExecArray | null;
          while ((m = attrRe.exec(attrStr))) attrs[m[1].toLowerCase()] = m[2];
          tokens.push({ t: "open", tag, attrs });
          if (tag === "br") tokens.push({ t: "close", tag });
        }
        return;
      }
      tokens.push({ t: "text", text: chunk });
    });

    // Style state
    let bold = false,
      italic = false,
      link: string | null = null;
    let listStack: Array<{ ordered: boolean; index: number }> = [];
    let inBlockquote = false,
      inPre = false,
      inCode = false;

    const applyFont = () => {
      if (bold && italic) doc.font("Helvetica-BoldOblique");
      else if (bold) doc.font("Helvetica-Bold");
      else if (italic) doc.font("Helvetica-Oblique");
      else doc.font("Helvetica");
      doc.fontSize(fontSize).fillColor(baseColor);
      doc.lineGap(lineGap);
    };

    const paraSpace = (lines = 0.5) => doc.moveDown(lines);

    const write = (
      text: string,
      opts: Partial<PDFKit.Mixins.TextOptions> = {},
    ) => {
      // Always position absolutely at x; let PDFKit manage y advance
      doc.text(text, x, (doc as any).y, {
        width,
        continued: false,
        lineBreak: true,
        ...opts,
      });
    };

    const writeInline = (
      text: string,
      opts: Partial<PDFKit.Mixins.TextOptions> = {},
    ) => {
      doc.text(text, {
        width,
        continued: true,
        lineBreak: false,
        ...opts,
      });
    };

    // Render
    applyFont();
    for (const tk of tokens) {
      if (tk.t === "open") {
        switch (tk.tag) {
          case "p":
            paraSpace(0.2);
            break;
          case "br":
            doc.moveDown(0.2);
            break;
          case "strong":
          case "b":
            bold = true;
            applyFont();
            break;
          case "em":
          case "i":
            italic = true;
            applyFont();
            break;
          case "a":
            link = tk.attrs.href || null;
            break;
          case "ul":
            listStack.push({ ordered: false, index: 0 });
            paraSpace(0.2);
            break;
          case "ol":
            listStack.push({ ordered: true, index: 0 });
            paraSpace(0.2);
            break;
          case "li": {
            const top = listStack[listStack.length - 1] || {
              ordered: false,
              index: 0,
            };
            if (top.ordered) top.index++;
            const bullet = top.ordered ? `${top.index}. ` : "• ";
            applyFont();
            // bullet
            writeInline(bullet, { lineBreak: false });
            break;
          }
          case "blockquote":
            inBlockquote = true;
            // indent a bit by shifting x via spaces; simpler than absolute x change
            paraSpace(0.2);
            break;
          case "pre":
            inPre = true;
            applyFont();
            doc.fontSize(fontSize - 1);
            paraSpace(0.2);
            break;
          case "code":
            inCode = true;
            applyFont();
            break;
          case "h1":
          case "h2":
          case "h3":
          case "h4": {
            const sizes: Record<string, number> = {
              h1: 18,
              h2: 16,
              h3: 14,
              h4: 12,
            };
            paraSpace(0.4);
            doc
              .font("Helvetica-Bold")
              .fontSize(sizes[tk.tag])
              .fillColor("#202124");
            break;
          }
        }
      } else if (tk.t === "close") {
        switch (tk.tag) {
          case "p":
            paraSpace(0.6);
            applyFont();
            break;
          case "strong":
          case "b":
            bold = false;
            applyFont();
            break;
          case "em":
          case "i":
            italic = false;
            applyFont();
            break;
          case "a":
            link = null;
            break;
          case "ul":
          case "ol":
            listStack.pop();
            paraSpace(0.3);
            applyFont();
            break;
          case "li":
            // finish the line started by bullet
            doc.text(""); // end continued run
            break;
          case "blockquote":
            inBlockquote = false;
            paraSpace(0.4);
            applyFont();
            break;
          case "pre":
            inPre = false;
            paraSpace(0.4);
            applyFont();
            break;
          case "code":
            inCode = false;
            applyFont();
            break;
          case "h1":
          case "h2":
          case "h3":
          case "h4":
            paraSpace(0.3);
            applyFont();
            break;
          case "br":
            // already moved down
            break;
        }
      } else {
        // text
        let txt = tk.text || "";
        if (!inPre) txt = txt.replace(/\s+/g, " ");
        const align: PDFKit.Mixins.TextOptions["align"] =
          inPre || inCode ? "left" : "justify";
        if (link) {
          write(txt, { align, underline: true, link });
        } else {
          write(txt, { align });
        }
      }
    }
    // Close any continued run
    doc.text("");
  }

  /** Pretty string for a file’s signature fields */
private formatSignature(
  file: { signerName?: string | null; signerEmail?: string | null; signedAt?: Date | string | null },
  dtFmt: Intl.DateTimeFormat
): string {
  const name = (file.signerName ?? "").trim();
  const email = (file.signerEmail ?? "").trim();
  const when = file.signedAt ? dtFmt.format(new Date(file.signedAt)) : null;

  if (when) {
    const who = [name, email && `<${email}>`].filter(Boolean).join(" ");
    return `Signed by ${who || "Unknown"} on ${when}`;
  }
  if (name || email) {
    const who = [name, email && `<${email}>`].filter(Boolean).join(" ");
    return `Signature pending — ${who}`;
  }
  return "No signature";
}


  /**
   * Generates a richly formatted PDF report for a project.
   * - Strips HTML in description/comments
   * - Paginates safely
   * - Clickable links for files
   *
   * @param res optional Express response to also stream PDF
   * @param projectId the project id
   * @param filters Prisma.IssueWhereInput to filter issues
   * @param alsoStream stream PDF to `res` as well as returning buffer
   */
  async generateProjectReport(
    res: Response | null,
    projectId: string,
    filters?: Prisma.IssueWhereInput,
    alsoStream: boolean = false,
  ): Promise<{ message: string; projectId: string; data: Buffer }> {
    try {
      if (!projectId) throw new BadRequestException("Project ID is required");

      const whereIssues: Prisma.IssueWhereInput = this.isPlainObject(filters)
        ? filters!
        : {};

      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          company: true,
          user: true,
          files: { orderBy: { createdAt: "desc" } },
          issues: {
            where: whereIssues,
            orderBy: { createdAt: "desc" },
            include: { issueFiles: true, user: true },
          },
          ProjectChecklist: {
            orderBy: { createdAt: "desc" },
            include: {
              template: true,
              User: true,
              items: {
                orderBy: { order: "asc" },
                include: {
                  attachmentFile: true,
                  user: true,
                  templateItem: true,
                },
              },
            },
          },
        },
      });
      if (!project) throw new NotFoundException("Project not found");

      const issues = project.issues ?? [];
      const norm = (s?: string | null) => (s || "").toUpperCase().trim();
      const totalIssues = issues.length;
      const openIssues = issues.filter((i) =>
        /TO DO|OPEN|BACKLOG/.test(norm(i.status)),
      ).length;
      const inProgressIssues = issues.filter((i) =>
        /IN PROGRESS|WIP|ACTIVE/.test(norm(i.status)),
      ).length;
      const closedIssues = issues.filter((i) =>
        /COMPLETED|DONE|CLOSED/.test(norm(i.status)),
      ).length;

      const dtFmt = new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      // PDF document
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 60, bottom: 60, left: 50, right: 50 },
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: `Project Report - ${this.stripHtml(project.title) || project.id}`,
          Author: project.user?.displayName || project.user?.name || "System",
          Subject: "Project Report",
          Keywords: "Project, Report, Issues, Files, Checklist",
          Creator: "Viewsoft Server",
        },
      });

      const chunks: Buffer[] = [];
      let pdfError: Error | null = null;

      doc.on("data", (b: Buffer) => chunks.push(b));
      doc.on("error", (e: Error) => {
        pdfError = e;
      });

      if (alsoStream && res) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="project_${projectId}.pdf"`,
        );
        doc.pipe(res);
      }


      // Convenient geometry
      const left = doc.page.margins.left ?? 50;
      const rightX = (doc.page.width ?? 595) - (doc.page.margins.right ?? 50);
      const width = rightX - left;

      // ───────────────────────────────── COVER ─────────────────────────────────
      doc
        .font("Helvetica-Bold")
        .fontSize(24)
        .fillColor("#202124")
        .text("Project Report", { align: "center" });
      doc.moveDown(0.5);
      doc
        .font("Helvetica")
        .fontSize(14)
        .fillColor("#5F6368")
        .text(`Generated on ${dtFmt.format(new Date())}`, { align: "center" });
      doc.moveDown(1.2);

      // ─────────────────────────────── SUMMARY CARD ─────────────────────────────
      {
        const innerLeft = left + 16;
        const innerWidth = width - 32;
        const padTop = 12;
        const padBottom = 12;
        const gap = 6;

        const titleText = this.stripHtml(project.title) || "Untitled Project";
        const owner = project.user?.displayName || project.user?.name || "N/A";
        const companyName =
          project.company?.name || project.companyName || "N/A";
        const startWk =
          project.startWeek ??
          (project.startDate
            ? getISOWeek(new Date(project.startDate))
            : undefined);
        const endWk =
          project.endWeek ??
          (project.endDate ? getISOWeek(new Date(project.endDate)) : undefined);

        const bodyLines: string[] = [
          `Company: ${companyName}`,
          `Owner: ${owner}`,
          `Status: ${project.status || "N/A"}`,
          `Start: ${project.startDate ? dtFmt.format(new Date(project.startDate)) : "N/A"}${startWk ? ` (Week ${startWk})` : ""}`,
          `End: ${project.endDate ? dtFmt.format(new Date(project.endDate)) : "N/A"}${endWk ? ` (Week ${endWk})` : ""}`,
        ];
        const bodyText = bodyLines.join("\n");

        const titleH = doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .heightOfString(titleText, { width: innerWidth });
        const bodyH = doc
          .font("Helvetica")
          .fontSize(11)
          .heightOfString(bodyText, { width: innerWidth });

        const cardH = padTop + titleH + gap + bodyH + padBottom;

        this.ensureSpace(doc, cardH + 10);
        const cardTop = doc.y;

        // background
        doc.save();
        doc.roundedRect(left, cardTop, width, cardH, 12).fill("#F8F9FA");
        doc.restore();

        // title
        doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .fillColor("#202124")
          .text(titleText, innerLeft, cardTop + padTop, { width: innerWidth });

        // body
        doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#5F6368")
          .text(bodyText, innerLeft, cardTop + padTop + titleH + gap, {
            width: innerWidth,
          });

        // advance below card
        doc.y = cardTop + cardH + 16;
      }

      // ───────────────────────────── EXECUTIVE SUMMARY ──────────────────────────
      this.drawSectionHeading(doc, "Executive Summary");
      this.ensureSpace(doc, 60);
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("#202124")
        .text(`Total Issues: ${totalIssues}`);
      doc.moveDown(0.4);
      doc.text("Status Breakdown:");
      this.drawStatusChip(doc, `Todo: ${openIssues}`);
      this.drawStatusChip(doc, `In Progress: ${inProgressIssues}`);
      this.drawStatusChip(doc, `Completed: ${closedIssues}`);
      doc.moveDown(0.6);

      const descHtml = project.description || "";
      if (descHtml.trim()) {
        this.drawSectionHeading(doc, "Description");

        const left = doc.page.margins.left ?? 50;
        const rightX = (doc.page.width ?? 595) - (doc.page.margins.right ?? 50);
        const width = rightX - left;

        // Record start Y, render rich HTML, then draw a subtle left rule for emphasis
        const startY = (doc as any).y;
        this.renderEditorHtml(doc, descHtml, left, width * 0.94, {
          fontSize: 11,
          lineGap: 2,
          color: "#202124",
        });
        const endY = (doc as any).y;

        // Left accent (no need to pre-measure height)
        doc.save();
        doc
          .moveTo(left - 6, startY)
          .lineTo(left - 6, endY)
          .lineWidth(3)
          .strokeColor("#E0E3E7")
          .stroke();
        doc.restore();

        doc.moveDown(0.6);
      }

      // ─────────────────────────────── PROJECT FILES ────────────────────────────
      // if (project.files?.length) {
      //   this.drawSectionHeading(doc, "Project Files");

      //   const col1 = 0.45 * width; // name
      //   const col2 = 0.3 * width; // link
      //   const col3 = 0.25 * width; // created at

      //   this.ensureSpace(doc, 28);
      //   let rowY = doc.y;

      //   // header row
      //   doc.save().rect(left, rowY, width, 26).fill("#F1F3F4").restore();
      //   this.tableHeaderCell(doc, "File Name", left + 10, rowY, col1 - 10);
      //   this.tableHeaderCell(doc, "Link", left + col1 + 10, rowY, col2 - 20);
      //   this.tableHeaderCell(
      //     doc,
      //     "Created At",
      //     left + col1 + col2 + 10,
      //     rowY,
      //     col3 - 10,
      //     "right",
      //   );
      //   rowY += 26;

      //   project.files.forEach((f: ProjectFile, idx: number) => {
      //     // ensure space for the next row; if page added, reset rowY to doc.y
      //     this.ensureSpace(doc, 24);
      //     if (doc.y !== rowY) rowY = doc.y;

      //     if (idx % 2 === 0) {
      //       doc.save().rect(left, rowY, width, 24).fill("#FAFBFC").restore();
      //     }
      //     const fileName = path.basename(f.filePath || "");
      //     const url = this.buildPublicUrl(
      //       process.env.SERVER_URL,
      //       f.filePath || "",
      //     );

      //     this.tableBodyCell(doc, fileName || "—", left + 10, rowY, col1 - 10);

      //     doc.save();
      //     doc
      //       .fillColor("#1A73E8")
      //       .font("Helvetica")
      //       .fontSize(10)
      //       .text("[Open]", left + col1 + 10, rowY + 6, {
      //         link: url,
      //         underline: true,
      //         width: col2 - 20,
      //       });
      //     doc.restore();

      //     this.tableBodyCell(
      //       doc,
      //       dtFmt.format(new Date(f.createdAt)),
      //       left + col1 + col2 + 10,
      //       rowY,
      //       col3 - 10,
      //       "right",
      //     );

      //     rowY += 24;
      //     doc.y = rowY;
      //   });

      //   doc.moveDown(0.8);
      // }

      // ─────────────────────────────── PROJECT FILES ────────────────────────────
if (project.files?.length) {
  this.drawSectionHeading(doc, "Project Files");

  const col1 = 0.45 * width; // name
  const col2 = 0.30 * width; // link
  const col3 = 0.25 * width; // created at

  // Local helper to pretty-print signature info
  const formatSignatureLine = (file: {
    signerName?: string | null;
    signerEmail?: string | null;
    signedAt?: Date | string | null;
  }) => {
    const name = (file.signerName ?? "").trim();
    const email = (file.signerEmail ?? "").trim();
    const when = file.signedAt ? dtFmt.format(new Date(file.signedAt)) : null;

    if (when) {
      const who = [name, email && `<${email}>`].filter(Boolean).join(" ");
      return `Signed by ${who || "Unknown"} on ${when}`;
    }
    if (name || email) {
      const who = [name, email && `<${email}>`].filter(Boolean).join(" ");
      return `Signature pending — ${who}`;
    }
    return "No signature";
  };

  this.ensureSpace(doc, 28);
  let rowY = doc.y;

  // header row
  doc.save().rect(left, rowY, width, 26).fill("#F1F3F4").restore();
  this.tableHeaderCell(doc, "File Name", left + 10, rowY, col1 - 10);
  this.tableHeaderCell(doc, "Link", left + col1 + 10, rowY, col2 - 20);
  this.tableHeaderCell(
    doc,
    "Created At",
    left + col1 + col2 + 10,
    rowY,
    col3 - 10,
    "right",
  );
  rowY += 26;

  project.files.forEach((f: ProjectFile, idx: number) => {
    // base row
    this.ensureSpace(doc, 24);
    if (doc.y !== rowY) rowY = doc.y;

    if (idx % 2 === 0) {
      doc.save().rect(left, rowY, width, 24).fill("#FAFBFC").restore();
    }

    const fileName = path.basename(f.filePath || "");
    const url = f.annotationDownloadUrl ? f.annotationDownloadUrl : this.buildPublicUrl(process.env.SERVER_URL, f.filePath || "");

    this.tableBodyCell(doc, fileName || "—", left + 10, rowY, col1 - 10);

    doc.save();
    doc
      .fillColor("#1A73E8")
      .font("Helvetica")
      .fontSize(10)
      .text("[Open]", left + col1 + 10, rowY + 6, {
        link: url,
        underline: true,
        width: col2 - 20,
      });
    doc.restore();

    this.tableBodyCell(
      doc,
      dtFmt.format(new Date(f.createdAt)),
      left + col1 + col2 + 10,
      rowY,
      col3 - 10,
      "right",
    );

    rowY += 24;
    doc.y = rowY;

    // signature sub-row (ONLY for isOrder files)
    if ((f as any).isOrder) {
      const signed = !!(f as any).signedAt;
      const sigText = formatSignatureLine(f as any);

      // ensure space for signature line
      this.ensureSpace(doc, 22);
      if (doc.y !== rowY) rowY = doc.y;

      // subtle background for the sub-row
      doc.save().rect(left, rowY, width, 22).fill("#FFFFFF").restore();

      // signature text (spans the full table width, with a chip on the right)
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#202124")
        .text(`Signature: ${sigText}`, left + 10, rowY + 5, {
          width: width - 120, // leave room for the chip
        });

      // status chip (SIGNED / NOT SIGNED)
      doc.font("Helvetica-Bold").fontSize(9);
      const chip = signed ? "SIGNED" : "NOT SIGNED";
      const chipW = doc.widthOfString(chip) + 16;
      const chipH = doc.currentLineHeight() + 6;
      const chipX = left + width - chipW - 10;
      const chipY = rowY + 4;

      doc.save();
      doc
        .roundedRect(chipX, chipY, chipW, chipH, 6)
        .fill(signed ? "#E6F4EA" : "#FCE8E6");
      doc
        .fillColor(signed ? "#137333" : "#C5221F")
        .text(chip, chipX + 8, chipY + 3);
      doc.restore();

      rowY += 22;
      doc.y = rowY;
    }
  });

  doc.moveDown(0.8);
}


      // ────────────────────────────────── ISSUES ────────────────────────────────
      if (issues.length) {
        this.drawSectionHeading(doc, "Issues");

        issues.forEach(
          (issue: Issue & { issueFiles: any[]; user?: User }, idx: number) => {
            const innerPad = 12;
            const innerLeft = left + 14;
            const innerWidth = width - 28;
            const gap = 6;

            // build strings
            const title = `${idx + 1}. ${this.stripHtml(issue.title) || "Untitled Issue"}`;
            const meta = `Created: ${dtFmt.format(new Date(issue.createdAt))} • By: ${issue.user?.displayName || issue.user?.name || "N/A"}`;
            const desc = this.stripHtml(issue.description) || "";
            const statusLabel = issue.status || "Unknown";

            // measure
            const titleH = doc
              .font("Helvetica-Bold")
              .fontSize(13)
              .heightOfString(title, { width: innerWidth });
            const chipH = doc
              .font("Helvetica-Bold")
              .fontSize(10)
              .heightOfString(statusLabel.toUpperCase(), { width: innerWidth });
            const metaH = doc
              .font("Helvetica")
              .fontSize(10)
              .heightOfString(meta, { width: innerWidth });
            const descH = desc
              ? doc
                  .font("Helvetica")
                  .fontSize(11)
                  .heightOfString(desc, { width: innerWidth })
              : 0;

            let attachH = 0;
            if (issue.issueFiles?.length) {
              const attachLines = ["Attachments:"]
                .concat(
                  issue.issueFiles.map(
                    (f: any) =>
                      `• ${path.basename(f.filePath || "") || "file"}`,
                  ),
                )
                .join("\n");
              attachH = doc
                .font("Helvetica")
                .fontSize(10)
                .heightOfString(attachLines, { width: innerWidth });
            }

            const blockH =
              innerPad +
              titleH +
              gap +
              chipH +
              gap +
              metaH +
              (desc ? gap + descH : 0) +
              (attachH ? gap + attachH : 0) +
              innerPad;

            this.ensureSpace(doc, blockH + 8);
            const boxTop = doc.y;

            // background
            doc.save();
            doc.roundedRect(left, boxTop, width, blockH, 10).fill("#F8F9FA");
            doc.restore();

            // draw title
            let cy = boxTop + innerPad;
            doc
              .font("Helvetica-Bold")
              .fontSize(13)
              .fillColor("#202124")
              .text(title, innerLeft, cy, { width: innerWidth });
            cy += titleH + gap;

            // place status chip at explicit position
            (doc as any).x = innerLeft;
            (doc as any).y = cy;
            this.drawStatusChip(doc, statusLabel);
            cy = (doc as any).y + gap;

            // meta
            doc
              .font("Helvetica")
              .fontSize(10)
              .fillColor("#5F6368")
              .text(meta, innerLeft, cy, { width: innerWidth });
            cy += metaH;

            // description
            if (desc) {
              cy += gap;
              doc
                .font("Helvetica")
                .fontSize(11)
                .fillColor("#202124")
                .text(desc, innerLeft, cy, { width: innerWidth });
              cy += descH;
            }

            // attachments
            if (issue.issueFiles?.length) {
              cy += gap;
              doc
                .font("Helvetica-Bold")
                .fontSize(10)
                .fillColor("#202124")
                .text("Attachments:", innerLeft, cy, { width: innerWidth });
              const headH = doc.heightOfString("Attachments:", {
                width: innerWidth,
              });
              cy += headH;

              issue.issueFiles.forEach((ifile: any) => {
                const fname = path.basename(ifile.filePath || "");
                const url = this.buildPublicUrl(
                  process.env.SERVER_URL,
                  ifile.filePath || "",
                );
                doc
                  .fillColor("#1A73E8")
                  .font("Helvetica")
                  .fontSize(10)
                  .text(`• ${fname || "file"}`, innerLeft, cy, {
                    width: innerWidth,
                    link: url,
                    underline: true,
                  });
                cy += doc.heightOfString(`• ${fname || "file"}`, {
                  width: innerWidth,
                });
              });
            }

            // advance below card
            doc.y = boxTop + blockH + 10;
          },
        );
      }

      // ──────────────────────────────── CHECKLISTS ──────────────────────────────
      const checklists = project.ProjectChecklist ?? [];
      if (checklists.length) {
        this.drawSectionHeading(doc, "Project Checklists");

        checklists.forEach(
          (
            cl: ProjectChecklist & {
              template: any;
              User?: User;
              items: ProjectChecklistItem[];
            },
            idx: number,
          ) => {
            // Header block
            {
              const pad = 12;
              const innerLeft = left + 14;
              const innerWidth = width - 28;

              const headerTitle = `Checklist ${idx + 1}: ${this.stripHtml(cl.template?.name) || "Untitled"}`;
              const headerMeta = `Created by: ${cl.User?.displayName || cl.User?.name || "N/A"}  •  ${dtFmt.format(new Date(cl.createdAt))}`;

              const titleH = doc
                .font("Helvetica-Bold")
                .fontSize(13)
                .heightOfString(headerTitle, { width: innerWidth });
              const metaH = doc
                .font("Helvetica")
                .fontSize(10)
                .heightOfString(headerMeta, { width: innerWidth });

              const headerH = pad + titleH + 4 + metaH + pad;

              this.ensureSpace(doc, headerH + 8);
              const headTop = doc.y;

              doc.save();
              doc
                .roundedRect(left, headTop, width, headerH, 10)
                .fill("#F8F9FA");
              doc.restore();

              doc
                .font("Helvetica-Bold")
                .fontSize(13)
                .fillColor("#202124")
                .text(headerTitle, innerLeft, headTop + pad, {
                  width: innerWidth,
                });
              doc
                .font("Helvetica")
                .fontSize(10)
                .fillColor("#5F6368")
                .text(headerMeta, innerLeft, headTop + pad + titleH + 4, {
                  width: innerWidth,
                });

              doc.y = headTop + headerH + 8;
            }

            // Items
            cl.items?.forEach((item: ProjectChecklistItem, iIdx: number) => {
              const innerLeft = left;
              const innerWidth = width;
              const gap = 4;

              const q = `${iIdx + 1}. ${this.stripHtml(item.question) || "—"}`;
              const ans =
                item.answer === true
                  ? "Yes"
                  : item.answer === false
                    ? "No"
                    : "Unanswered";
              const meta = `By: ${
                item.userId
                  ? (cl.items[iIdx] as any).user?.displayName ||
                    (cl.items[iIdx] as any).user?.name ||
                    "N/A"
                  : "N/A"
              } • ${dtFmt.format(new Date(item.createdAt))}`;
              const comment = this.stripHtml(item.comment) || "";

              const qH = doc
                .font("Helvetica-Bold")
                .fontSize(11)
                .heightOfString(q, { width: innerWidth });
              const chipH = doc
                .font("Helvetica-Bold")
                .fontSize(10)
                .heightOfString(ans.toUpperCase(), { width: innerWidth });
              const metaH = doc
                .font("Helvetica")
                .fontSize(10)
                .heightOfString(meta, { width: innerWidth });
              const commentH = comment
                ? doc
                    .font("Helvetica")
                    .fontSize(10)
                    .heightOfString(comment, { width: innerWidth })
                : 0;

              const anyItem = item as any;
              const attachmentLine = anyItem.attachmentFile
                ? `Attachment: ${path.basename(anyItem.attachmentFile.filePath || "") || "file"}`
                : "";
              const attachH = attachmentLine
                ? doc
                    .font("Helvetica")
                    .fontSize(10)
                    .heightOfString(attachmentLine, { width: innerWidth })
                : 0;

              const blockH =
                qH +
                gap +
                chipH +
                gap +
                metaH +
                (comment ? gap + commentH : 0) +
                (attachmentLine ? gap + attachH : 0) +
                8;

              this.ensureSpace(doc, blockH + 6);
              const topY = doc.y;

              // question
              doc
                .font("Helvetica-Bold")
                .fontSize(11)
                .fillColor("#202124")
                .text(q, innerLeft, topY, { width: innerWidth });

              // chip at explicit spot
              (doc as any).x = innerLeft;
              (doc as any).y = topY + qH + gap;
              this.drawStatusChip(doc, ans);

              let cy = (doc as any).y + gap;

              doc
                .font("Helvetica")
                .fontSize(10)
                .fillColor("#5F6368")
                .text(meta, innerLeft, cy, { width: innerWidth });
              cy += metaH;

              if (comment) {
                cy += gap;
                doc
                  .font("Helvetica")
                  .fontSize(10)
                  .fillColor("#202124")
                  .text(comment, innerLeft, cy, { width: innerWidth });
                cy += commentH;
              }

              if (attachmentLine) {
                cy += gap;
                const url = this.buildPublicUrl(
                  process.env.SERVER_URL,
                  anyItem.attachmentFile.filePath || "",
                );
                doc
                  .font("Helvetica")
                  .fontSize(10)
                  .fillColor("#1A73E8")
                  .text(attachmentLine, innerLeft, cy, {
                    width: innerWidth,
                    underline: true,
                    link: url,
                  });
              }

              doc.y = topY + blockH + 6;
            });
          },
        );
      }

      // ────────────────────────────────── FINISH ────────────────────────────────
      // IMPORTANT: make sure bufferPages is true on doc creation (you already have it)
      const before = doc.bufferedPageRange().count;
      this.applyHeaderFooterAfterContent(
        doc,
        this.stripHtml(project.title) || `Project ${project.id}`,
      );
      const after = doc.bufferedPageRange().count;
      this.logger.log(`Header/footer pages before=${before}, after=${after}`);
      doc.end();

      const buffer: Buffer = await new Promise<Buffer>((resolve, reject) => {
        doc.on("end", () => {
          if (pdfError)
            return reject(
              new InternalServerErrorException(
                `PDF generation error: ${pdfError.message}`,
              ),
            );
          resolve(Buffer.concat(chunks));
        });
        doc.on("error", (e: Error) =>
          reject(
            new InternalServerErrorException(
              `PDF generation error: ${e.message}`,
            ),
          ),
        );
      });

      return { message: "PDF_GENERATED", projectId, data: buffer };
    } catch (err: any) {
      this.logger.error(
        `generateProjectReport failed: ${err?.message || err}`,
        err?.stack,
      );
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof InternalServerErrorException
      )
        throw err;
      throw new InternalServerErrorException(
        "Failed to generate project report",
      );
    }
  }

  async createProject(
    req: Request & { userDetails?: User },
    files: Array<Express.Multer.File>,
    body,
  ) {
    try {
      const { id: userId } = req.userDetails;

      // 1) Validate companyId as before…
      if (body.companyId) {
        const company = await this.prisma.company.findUnique({
          where: { id: body.companyId },
        });
        if (!company) throw new NotFoundException("Company not found!");
      }

      // 2) Parse the project dates up front
      const startDt = body.startDate ? new Date(body.startDate) : null;
      const endDt = body.endDate ? new Date(body.endDate) : null;

      // 3) If you’ve got userIds to assign, check conflicts
      let candidates: string[] = [];
      if (body.userIds && startDt && endDt) {
        const parsedUserIds: string[] = JSON.parse(body.userIds);
        if (parsedUserIds.length) {
          // find any existing availability overlapping this window, including username
          const conflicts = await this.prisma.availability.findMany({
            where: {
              userId: { in: parsedUserIds },
              AND: [
                { startDate: { lte: endDt } },
                { endDate: { gte: startDt } },
              ],
            },
            select: {
              user: {
                select: { displayName: true },
              },
            },
          });

          // if (conflicts.length) {
          //   // extract unique usernames
          //   const conflictNames = Array.from(
          //     new Set(conflicts.map((c) => c.user.displayName)),
          //   );
          //   throw new BadRequestException(
          //     `Cannot assign users [${conflictNames.join(
          //       ", ",
          //     )}] — they already have availability in that timeframe.`,
          //   );
          // }

          // If no conflicts, keep them for your createMany below
          candidates = parsedUserIds;
        }
      }

      // 4) Create the Project
      const newProject = await this.prisma.project.create({
        data: {
          title: body.title,
          description: body.description,
          status: body.status?.toUpperCase(),
          startDate: startDt,
          endDate: endDt,
          startWeek: startDt ? getISOWeek(startDt) : null,
          endWeek: endDt ? getISOWeek(endDt) : null,
          userId,
          companyId: body.companyId || null,
          isOrder: body.isOrder === "true" || false,
        },
      });

      // ——— NEW: assign the default checklist template ———
      const defaultTemplate = await this.prisma.checklistTemplate.findFirst({
        where: { isDefault: true },
        include: { items: true },
      });
      if (defaultTemplate) {
        // copy & re-sequence its items exactly like upsertProjectChecklist does
        const raw = defaultTemplate.items.map((i, idx) => ({ ...i, idx }));
        const withOrder = raw
          .filter((i) => i.order != null)
          .sort((a, b) => a.order - b.order || a.idx - b.idx);
        const withoutOrder = raw.filter((i) => i.order == null);
        const ordered = [...withOrder, ...withoutOrder];

        await this.prisma.projectChecklist.create({
          data: {
            projectId: newProject.id,
            templateId: defaultTemplate.id,
            userId,
            items: {
              create: ordered.map((i, idx) => ({
                templateItemId: i.id,
                order: idx + 1,
                question: i.question,
                userId, // track who seeded it
              })),
            },
          },
        });
        this.logger.log(
          `Assigned default checklist ${defaultTemplate.id} to project ${newProject.id}`,
        );
      }

      // 5) Seed assignments & availabilities in one shot
      if (candidates.length) {
        // a) assignments
        await this.prisma.projectAssignment.createMany({
          data: candidates.map((uid) => ({
            projectId: newProject.id,
            userId: uid,
          })),
          skipDuplicates: true,
        });

        // b) availabilities
        await this.prisma.availability.createMany({
          data: candidates.map((uid) => ({
            projectId: newProject.id,
            userId: uid,
            startDate: startDt,
            endDate: endDt,
            startWeek: getISOWeek(startDt),
            endWeek: getISOWeek(endDt),
          })),
          skipDuplicates: true,
        });
      }

      // 6) File handling as before…
      if (files.length) {
        for (const file of files) {
          await this.prisma.file.create({
            data: {
              projectId: newProject.id,
              filePath: pathPosix.join("uploads", "projects", file.filename),
              isOrder: body.isOrder === "true",
            },
          });
        }
      }

      if (body.isOrder === "true") {
        const defaultFileName = "Service English.pdf";

        // Source (master template file)
        const srcPath = join("uploads", "orders", defaultFileName);

        // Generate a safe unique filename for disk storage
        const ext = pathPosix.extname(defaultFileName); // .pdf
        const base = pathPosix.basename(defaultFileName, ext); // Service English
        const uniqueName = `${base}-${randomUUID()}${ext}`; // e.g. Service English-123e4567-e89b.pdf

        // Destination path (projects folder)
        const destPath = join("uploads", "projects", uniqueName);

        // Copy file
        copyFileSync(srcPath, destPath);

        // Save DB record
        await this.prisma.file.create({
          data: {
            projectId: newProject.id,
            filePath: pathPosix.join("uploads", "projects", uniqueName),
            isOrder: true,
          },
        });

        this.logger.log(
          `Copied default order file for project ${newProject.id} → ${destPath}`,
        );
      }

      this.logger.log(`Project created successfully: ${newProject.id}`);
      return { message: "Project created successfully", data: newProject };
    } catch (error) {
      this.logger.error("Failed to create project", error);

      if (files && files.length > 0) {
        for (const file of files) {
          try {
            await unlink(join("./uploads/projects", file.filename));
            this.logger.log(`Deleted file: ${file.filename}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${file.filename}`, err);
          }
        }
      }

      throw error;
    }
  }

  async updateProject(
    projectId: string,
    req: Request & { userDetails?: User },
    files: Array<Express.Multer.File>,
    data: any,
  ) {
    try {
      const { id: userId } = req.userDetails;

      // 1) Load existing project dates for fallback & ensure project exists
      const existingProject = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { startDate: true, endDate: true },
      });
      if (!existingProject) {
        throw new NotFoundException(`Project ${projectId} not found`);
      }

      // 2) Compute effective date window
      const startDt = data.startDate
        ? new Date(data.startDate)
        : existingProject.startDate;
      const endDt = data.endDate
        ? new Date(data.endDate)
        : existingProject.endDate;

      // 3) Conflict check: ensure new assignments don’t overlap other projects
      if (data.userIds && startDt && endDt) {
        const parsedUserIds: string[] = JSON.parse(data.userIds);
        if (parsedUserIds.length) {
          const conflicts = await this.prisma.availability.findMany({
            where: {
              userId: { in: parsedUserIds },
              projectId: { not: projectId },
              AND: [
                { startDate: { lte: endDt } },
                { endDate: { gte: startDt } },
              ],
            },
            select: {
              user: { select: { displayName: true } },
            },
          });

          // if (conflicts.length) {
          //   const names = Array.from(
          //     new Set(conflicts.map((c) => c.user.displayName)),
          //   );
          //   throw new BadRequestException(
          //     `Cannot assign users [${names.join(
          //       ", ",
          //     )}] — they’re already booked in that timeframe.`,
          //   );
          // }
        }
      }

      // 4) Build project-update payload
      const updateData: any = {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.status && { status: data.status.toUpperCase() }),
        startDate: startDt,
        endDate: endDt,
        ...(data.companyId && { companyId: data.companyId }),
        ...(data.isOrder && { isOrder: data.isOrder === "true" }),
        userId,
      };

      // 5) Apply project update
      const updatedProject = await this.prisma.project.update({
        where: { id: projectId },
        data: updateData,
      });

      // 6) Sync all existing availabilities if dates changed
      if (data.startDate || data.endDate) {
        await this.prisma.availability.updateMany({
          where: { projectId },
          data: {
            startDate: startDt,
            endDate: endDt,
            startWeek: startDt ? getISOWeek(startDt) : null,
            endWeek: endDt ? getISOWeek(endDt) : null,
          },
        });
      }

      // 7) Handle assigned users & reconcile availability
      if (data.userIds) {
        const parsedUserIds: string[] = JSON.parse(data.userIds);

        // a) Load previous assignments
        const prev = await this.prisma.projectAssignment.findMany({
          where: { projectId },
          select: { userId: true },
        });
        const prevUserIds = prev.map((a) => a.userId);

        // b) Delete old assignments, then add new
        await this.prisma.projectAssignment.deleteMany({
          where: { projectId },
        });
        if (parsedUserIds.length) {
          await this.prisma.projectAssignment.createMany({
            data: parsedUserIds.map((uid) => ({ projectId, userId: uid })),
            skipDuplicates: true,
          });
        }

        // c) Remove availabilities for users no longer assigned
        const removed = prevUserIds.filter(
          (uid) => !parsedUserIds.includes(uid),
        );
        if (removed.length) {
          await this.prisma.availability.deleteMany({
            where: {
              projectId,
              userId: { in: removed },
            },
          });
        }

        // d) Seed availabilities for newly assigned users
        const added = parsedUserIds.filter((uid) => !prevUserIds.includes(uid));
        if (added.length && startDt && endDt) {
          await this.prisma.availability.createMany({
            data: added.map((uid) => ({
              projectId,
              userId: uid,
              startDate: startDt,
              endDate: endDt,
              startWeek: getISOWeek(startDt),
              endWeek: getISOWeek(endDt),
            })),
            skipDuplicates: true,
          });
        }
      }

      // 8) File-upload handling
      const existingFiles = await this.prisma.file.findMany({
        where: { projectId },
        select: { filePath: true },
      });
      const existingNames = existingFiles.map((f) =>
        pathPosix.basename(f.filePath),
      );
      const newFiles = files.filter((f) => !existingNames.includes(f.filename));
      if (newFiles.length) {
        for (const file of newFiles) {
          await this.prisma.file.create({
            data: {
              projectId: updatedProject.id,
              filePath: pathPosix.join("uploads", "projects", file.filename),
              isOrder: data.isOrder === "true",
            },
          });
        }
      }

      // 9) Return updated project + files
      const allFiles = await this.prisma.file.findMany({
        where: { projectId },
        select: { id: true, filePath: true, createdAt: true, updatedAt: true },
      });

      const defaultOrderFilePath = pathPosix.join(
        "uploads",
        "orders",
        "Service English.pdf",
      );

      if (data.isOrder === "true") {
        const existedOrderFile = await this.prisma.file.findFirst({
          where: {
            isOrder: true,
            filePath: {
              startsWith: "uploads/projects/Service English" 
            },
            projectId,
          },
        });
        if (!existedOrderFile) {
          const defaultFileName = "Service English.pdf";

          // Source (master template file)
          const srcPath = join("uploads", "orders", defaultFileName);

          // Generate a safe unique filename for disk storage
          const ext = pathPosix.extname(defaultFileName); // .pdf
          const base = pathPosix.basename(defaultFileName, ext); // Service English
          const uniqueName = `${base}-${randomUUID()}${ext}`; // e.g. Service English-123e4567-e89b.pdf

          // Destination path (projects folder)
          const destPath = join("uploads", "projects", uniqueName);

          // Copy file
          copyFileSync(srcPath, destPath);

          // Save DB record
          await this.prisma.file.create({
            data: {
              projectId: projectId,
              filePath: pathPosix.join("uploads", "projects", uniqueName),
              isOrder: true,
            },
          });

          this.logger.log(
            `Copied default order file for project ${projectId} → ${destPath}`,
          );
        }
      }
      // if (data.isOrder === "true") {
      //   const existedOrderFile = await this.prisma.file.findFirst({
      //     where: {
      //       isOrder: true,
      //       filePath: defaultOrderFilePath,
      //       projectId,
      //     },
      //   });
      //   if (!existedOrderFile) {
      //     await this.prisma.file.create({
      //       data: {
      //         projectId: projectId,
      //         filePath: defaultOrderFilePath,
      //         isOrder: true,
      //       },
      //     });
      //     this.logger.log(
      //       `Attached default order file to project ${projectId}`,
      //     );
      //   } else {
      //     this.logger.log(
      //       `default order file is alrady attached to project ${projectId}`,
      //     );
      //   }
      // }
      if (data.isOrder === "false") {
        const existedOrderFile = await this.prisma.file.findFirst({
          where: {
            isOrder: true,
            filePath: {
              startsWith: "uploads/projects/Service English" 
            },
            projectId,
          },
        });
        if (existedOrderFile) {
          await this.prisma.file.delete({
            where: {
              id: existedOrderFile.id,
            },
          });
          this.logger.log(`default order file deleted in project ${projectId}`);
        }
      }

      this.logger.log(`Project updated successfully: ${updatedProject.id}`);
      return {
        message: "Project updated successfully!",
        data: {
          ...updatedProject,
          files: allFiles,
        },
      };
    } catch (error) {
      // Error handling & cleanup for newly uploaded files
      this.logger.error("Failed to update project", {
        message: error.message,
        stack: error,
      });
      if (files && files.length) {
        for (const file of files) {
          try {
            await unlink(join("./uploads/projects", file.filename));
            this.logger.log(`Deleted file: ${file.filename}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${file.filename}`, err);
          }
        }
      }
      throw error;
    }
  }

  async uploadFilesToProject(
    projectId: string,
    files: Array<Express.Multer.File>,
    isOrder: string,
  ) {
    try {
      // Validate if the project exists
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundException("Project not found!");
      }

      // Fetch existing file paths for this project
      const existingFiles = await this.prisma.file.findMany({
        where: { projectId },
        select: { filePath: true },
      });

      // Extract existing filenames
      const existingFileNames = existingFiles.map((file) =>
        pathPosix.basename(file.filePath),
      );

      // Separate new and existing files
      const newFiles = [];
      const skippedFiles = [];

      files.forEach((file) => {
        if (existingFileNames.includes(file.filename)) {
          skippedFiles.push({
            filename: file.filename,
            message: "File already exists for this project.",
          });
        } else {
          newFiles.push(file);
        }
      });

      // Insert only new files into the File table
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          await this.prisma.file.create({
            data: {
              projectId,
              filePath: pathPosix.join("uploads", "projects", file.filename),
              isOrder: isOrder === "true",
            },
          });
        }
      }

      this.logger.log(
        `Files uploaded to project: ${projectId}, Skipped files: ${skippedFiles.length}`,
      );

      return {
        message: "Files processed successfully!",
        projectId,
        uploadedFiles: newFiles.map((file) => file.filename),
        skippedFiles,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload files to project: ${projectId}`,
        error,
      );

      // Cleanup uploaded files on error
      if (files && files.length > 0) {
        for (const file of files) {
          try {
            await unlink(join("./uploads/projects", file.filename));
            this.logger.log(`Deleted file: ${file.filename}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${file.filename}`, err);
          }
        }
      }

      throw error;
    }
  }

  async getProjects(page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;
      const projects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          files: true,
        },
      });

      const totalProjects = await this.prisma.project.count();
      const response = {
        total: totalProjects,
        page,
        limit,
        totalPages: Math.ceil(totalProjects / limit),
        projects,
      };
      return {
        message: "Projects retrieved successfully!",
        data: response,
      };
    } catch (error) {
      this.logger.error("Failed to fetch projects", error);
      throw error;
    }
  }

  async getProjectList(page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;

      // Fetch projects with only id and name
      const projects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        where: {
          archived: false,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
        },
      });

      const totalProjects = await this.prisma.project.count();
      const response = {
        total: totalProjects,
        page,
        limit,
        totalPages: Math.ceil(totalProjects / limit),
        projects,
      };
      return {
        message: "Projects retrieved successfully!",
        data: response,
      };
    } catch (error) {
      this.logger.error("Failed to fetch projects", error);
      throw error;
    }
  }

  async getById(projectId: string) {
    try {
      // Fetch project by ID along with its files
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          files: {
            select: {
              id: true,
              filePath: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          user: {
            select: {
              email: true,
              displayName: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          assignedUsers: {
            select: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });

      if (!project) {
        throw new NotFoundException("Project not found");
      }

      return {
        message: "Project retrieved successfully!",
        data: project,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch project with id ${projectId}`, error);
      throw error;
    }
  }

  async getProjectIssues(projectId: string) {
    try {
      // Fetch all issues for the given project ID along with their associated files
      const issues = await this.prisma.issue.findMany({
        where: { projectId },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          issueFiles: {
            select: {
              id: true,
              filePath: true,
            },
          },
          user: {
            select: {
              email: true,
              displayName: true,
            },
          },
          project: {
            select: {
              id: true,
              archived: true,
              title: true,
            },
          },
          assignedUsers: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });

      // Initialize the columns with the required order
      const columns = [
        { id: "column-1", name: "Active", tasks: [] },
        { id: "column-2", name: "On Going", tasks: [] },
        { id: "column-3", name: "Completed", tasks: [] },
      ];

      // Iterate through the issues and push them into the appropriate column
      for (const issue of issues) {
        const task = {
          id: issue.id,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          startDate: issue.startDate,
          user: {
            email: issue.user.email,
            displayName: issue.user.displayName,
          },
          project: {
            id: issue.project.id,
            archived: issue.project.archived,
            title: issue.project.title,
          },
          endDate: issue.endDate,
          files: issue.issueFiles.map((file) => ({
            name: file.filePath.split("/").pop(),
            type: file.filePath.split(".").pop().toUpperCase(),
            url: file.filePath,
          })),
          assignedUsers: issue.assignedUsers,
          createdAt: issue.createdAt,
        };

        // Normalize the status to lowercase for comparison
        const status = issue.status.toLowerCase();

        // Push the task into the correct column based on its status
        switch (status?.toUpperCase()) {
          case "ACTIVE":
            columns[0].tasks.push(task);
            break;
          case "ON GOING":
            columns[1].tasks.push(task);
            break;
          case "COMPLETED":
            columns[2].tasks.push(task);
            break;
          default:
            // If status is unknown, push it to the "To Do" column by default
            columns[0].tasks.push(task);
            break;
        }
      }

      return {
        message: "Project issues retrieved successfully!",
        data: { issues, columns },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch issues for project with id ${projectId}`,
        error,
      );
      throw error;
    }
  }

  async getAllProjectIssues(userId?: string) {
    try {
      // Build the query filter dynamically
      const filter = userId
        ? {
            assignedUsers: {
              some: {
                userId: userId, // Filters issues where the user is assigned
              },
            },
          }
        : {};

      // Fetch issues filtered by userId if provided
      const issues = await this.prisma.issue.findMany({
        where: filter,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          issueFiles: {
            select: {
              id: true,
              filePath: true,
            },
          },
          user: {
            select: {
              email: true,
              displayName: true,
            },
          },
          project: {
            select: {
              id: true,
              archived: true,
              title: true,
            },
          },
          assignedUsers: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });

      // Initialize columns
      const columns = [
        { id: "column-1", name: "Active", tasks: [] },
        { id: "column-2", name: "On Going", tasks: [] },
        { id: "column-3", name: "Completed", tasks: [] },
      ];

      // Iterate through issues and categorize them by status
      for (const issue of issues) {
        const task = {
          id: issue.id,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          startDate: issue.startDate,
          user: {
            email: issue.user.email,
            displayName: issue.user.displayName,
          },
          project: {
            name: issue.project.title,
            id: issue.project.id,
            archived: issue.project.archived,
          },
          endDate: issue.endDate,
          files: issue.issueFiles.map((file) => ({
            name: file.filePath.split("/").pop(),
            type: file.filePath.split(".").pop().toUpperCase(),
            url: file.filePath,
          })),
          assignedUsers: issue.assignedUsers,
        };

        // Normalize status and assign tasks to columns
        const status = issue.status?.toUpperCase();

        switch (status) {
          case "ACTIVE":
            columns[0].tasks.push(task);
            break;
          case "ON GOING":
            columns[1].tasks.push(task);
            break;
          case "COMPLETED":
            columns[2].tasks.push(task);
            break;
          default:
            columns[0].tasks.push(task); // Default to "Active" if status is unknown
            break;
        }
      }

      return {
        message: "Issues retrieved successfully!",
        data: { issues, columns },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch issues`, error);
      throw error;
    }
  }

  async getAllProjectFiles(
    projectId: string,
    page: number = 1,
    limit: number = 1000,
  ) {
    try {
      // Fetch files from the database
      const projectFiles = await this.prisma.file.findMany({
        where: { projectId },
        orderBy: {
          updatedAt: "desc",
        },
      });
      const issueFiles = await this.prisma.issueFile.findMany({
        where: { issue: { projectId } },
        orderBy: {
          updatedAt: "desc",
        },
        include: {
          issue: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Combine and validate file existence
      const validateFileExists = async (file) => {
        const filePath = path.join("./", file.filePath);
        try {
          await fs.access(filePath); // Check if the file exists
          return true;
        } catch {
          return false;
        }
      };

      const files = [
        ...(
          await Promise.all(
            projectFiles.map(async (file) =>
              (await validateFileExists(file))
                ? { ...file, type: "projectFile", issue: null }
                : null,
            ),
          )
        ).filter(Boolean), // Filter out null entries
        ...(
          await Promise.all(
            issueFiles.map(async (file) =>
              (await validateFileExists(file))
                ? {
                    ...file,
                    type: "issueFile",
                    issue: { id: file.issue.id, title: file.issue.title },
                  }
                : null,
            ),
          )
        ).filter(Boolean),
      ];

      // Calculate pagination
      const totalFiles = files.length;
      const totalPages = Math.ceil(totalFiles / limit);
      const paginatedFiles = files.slice((page - 1) * limit, page * limit);

      return {
        message: "Files retrieved successfully!",
        data: {
          total: totalFiles,
          page,
          limit,
          totalPages,
          files: paginatedFiles,
        },
      };
    } catch (error) {
      this.logger.error("Failed to fetch project files", error);
      throw error;
    }
  }

  async deleteProject(
    projectId: string,
    // req: Request & { userDetails?: User },
  ) {
    try {
      // Verify if the user owns the project
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          // userId: req.userDetails?.id,
        },
      });

      if (!project) {
        this.logger.warn(`Project not found: ${projectId}`);
        throw new Error("Project not found");
      }

      // Find all associated files
      const files = await this.prisma.file.findMany({
        where: {
          projectId: projectId,
        },
      });
      const defaultOrderFilePath = pathPosix.join(
        "uploads",
        "orders",
        "Service English.pdf",
      );

      // Delete project files from the file system, except "Service English.pdf"
      for (const file of files) {
        if (file.filePath === defaultOrderFilePath) {
          this.logger.log(`Skipping protected file: ${file.filePath}`);
          continue;
        }

        try {
          await unlink(join("./", file.filePath));
          this.logger.log(`Deleted file from disk: ${file.filePath}`);
        } catch (err) {
          this.logger.error(
            `Failed to delete file from disk: ${file.filePath}`,
            err,
          );
        }
      }

      // Delete files from the database, except "Service English.pdf"
      await this.prisma.file.deleteMany({
        where: {
          projectId: projectId,
          NOT: {
            filePath: defaultOrderFilePath,
          },
        },
      });

      // Delete the project
      await this.prisma.project.delete({
        where: {
          id: projectId,
        },
      });

      this.logger.log(`Project deleted successfully: ${projectId}`);
      return { message: "Project deleted successfully" };
    } catch (error) {
      this.logger.error(`Failed to delete project: ${projectId}`, error);
      throw error;
    }
  }

  async getProjectStats() {
    try {
      // Fetch total project count
      const totalProjects = await this.prisma.project.count({
        where: { archived: false },
      });

      // Fetch total issue count
      const totalIssues = await this.prisma.issue.count();

      // Fetch total completed issues count
      const totalCompletedIssues = await this.prisma.issue.count({
        where: {
          status: "COMPLETED",
        },
      });

      // Fetch total to-do issues count
      const totalToDoIssues = await this.prisma.issue.count({
        where: {
          status: "ACTIVE",
        },
      });

      return {
        message: "Project statistics retrieved successfully!",
        data: {
          totalProjects,
          totalIssues,
          totalCompletedIssues,
          totalToDoIssues,
        },
      };
    } catch (error) {
      this.logger.error("Failed to retrieve project statistics", error);
      throw error;
    }
  }

  async getRecentProjects(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
    sortOrder: "asc" | "desc" = "desc",
  ) {
    try {
      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Build dynamic where clause
      const where: any = {
        archived: false, // Only include non-archived projects
      };

      if (search) {
        where.title = {
          contains: search, // Case-insensitive search for title
          mode: "insensitive",
        };
      }

      if (status) {
        where.status = status?.toUpperCase(); // Filter by exact status
      }

if (startDate) {
  const start = new Date(startDate);
  where.startDate = { gte: start };
}

if (endDate) {
  const end = new Date(endDate);

  // If endDate is passed without time, bump it to end of day
  if (endDate.length === 10) { // e.g. "2025-08-18"
    end.setHours(23, 59, 59, 999);
  }

  where.endDate = { lte: end };
}


      // Fetch recent projects with applied filters and sorting
      const recentProjects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        where,
        orderBy: {
          createdAt: sortOrder, // Sort by createdAt (asc or desc)
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Fetch the total project count with the same filters
      const totalProjects = await this.prisma.project.count({
        where,
      });

      // Return the response
      return {
        message: "Recent projects retrieved successfully!",
        data: {
          page,
          limit,
          totalProjects,
          totalPages: Math.ceil(totalProjects / limit),
          projects: recentProjects,
        },
      };
    } catch (error) {
      this.logger.error("Failed to fetch recent projects", error);
      throw error;
    }
  }

  async updateFile(
    params: { projectId?: string; issueId?: string; fileId: string },
    files: Express.Multer.File,
  ) {
    const { projectId, issueId, fileId } = params;

    try {
      // Validate input
      if (!fileId) {
        throw new BadRequestException("File ID is required!");
      }
      if (!files) {
        throw new BadRequestException("No file provided!");
      }
      if (!projectId && !issueId) {
        throw new BadRequestException(
          "Either projectId or issueId is required!",
        );
      }

      // Determine the context: project or issue
      const fileContext = projectId ? "project" : "issue";
      console.log("fileContext", fileContext);
      // Find the file in the database
      let existingFile;
      if (fileContext === "project") {
        existingFile = await this.prisma.file.findUnique({
          where: { id: fileId },
          include: { project: true },
        });
      } else {
        existingFile = await this.prisma.issueFile.findUnique({
          where: { id: fileId },
          include: { issue: true },
        });
      }

      if (!existingFile) {
        throw new NotFoundException("File not found!");
      }

      // Unlink the existing file from the server
      // const existingFilePath = join(
      //   "./", existingFile.filePath,
      // );
      // try {
      //   await unlink(existingFilePath);
      //   this.logger.log(`Unlinked existing file: ${existingFilePath}`);
      // } catch (unlinkError) {
      //   this.logger.error(
      //     `Failed to unlink file: ${existingFilePath}`,
      //     unlinkError,
      //   );
      // }

      // Construct the new file path
      const newFilePath = pathPosix.join(
        "uploads",
        "projects",
        files[0].filename,
      );

      // Update the file path in the database
      if (fileContext === "project") {
        await this.prisma.file.update({
          where: { id: fileId },
          data: { filePath: newFilePath },
        });
      } else {
        await this.prisma.issueFile.update({
          where: { id: fileId },
          data: { filePath: newFilePath },
        });
      }

      this.logger.log(
        `File updated for ${fileContext}: ${fileContext === "project" ? projectId : issueId}, fileId: ${fileId}`,
      );

      return {
        message: "File updated successfully!",
        updatedFilePath: newFilePath,
      };
    } catch (error) {
      this.logger.error("Failed to update file", error);
      throw error;
    }
  }

  async downloadFile(fileId: string, type: "project" | "issue" | "order") {
    try {
      // Fetch file details based on the type
      const file =
        type === "project" || type === "order"
          ? await this.prisma.file.findUnique({
              where: { id: fileId },
            })
          : await this.prisma.issueFile.findUnique({
              where: { id: fileId },
            });

      if (!file) {
        throw new NotFoundException("File not found!");
      }

      let filePath;
      // if (file.filePath.split("/").pop() === "Service English.pdf") {
      //   filePath = join(
      //     "./uploads",
      //     "orders",
      //     pathPosix.basename(file.filePath),
      //   );
      // } else {
      filePath = join(
        "./uploads",
        type === "project" || type === "order" ? "projects" : "issues",
        pathPosix.basename(file.filePath),
      );
      // }

      // Send the file to the user
      return {
        message: "DOWNLOAD_FILE",
        data: { filePath },
      };
    } catch (error) {
      this.logger.error(`Error downloading file: ${error.message}`);
      throw error;
    }
  }

  async toggleArchiveProject(projectId: string) {
    try {
      // Find the project to ensure it exists and get the current archived state
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundException("Project not found!");
      }

      // Toggle the archived state
      const newArchivedState = !project.archived;

      const updatedProject = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          archived: newArchivedState, // Toggle the state
        },
      });

      this.logger.log(
        `Project ${newArchivedState ? "archived" : "unarchived"} successfully: ${
          updatedProject.id
        }`,
      );

      return {
        message: `Project ${newArchivedState ? "archived" : "unarchived"} successfully`,
        data: updatedProject,
      };
    } catch (error) {
      this.logger.error("Failed to toggle archive state for project", {
        message: error.message,
        stack: error,
      });
      throw error;
    }
  }

  async getArchivedProjectList(page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;

      // Fetch projects with only id and name
      const projects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        where: {
          archived: true,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          description: true,
        },
      });

      const totalProjects = await this.prisma.project.count({
        where: {
          archived: true,
        },
      });
      const response = {
        total: totalProjects,
        page,
        limit,
        totalPages: Math.ceil(totalProjects / limit),
        projects,
      };
      return {
        message: "Projects retrieved successfully!",
        data: response,
      };
    } catch (error) {
      this.logger.error("Failed to fetch projects", error);
      throw error;
    }
  }

  // ** LOG HISTORY FOR ISSUE TASKS
  async updateIssueLogHistory(
    req: Request & { userDetails?: User },
    issueId: string,
    updateData: Array<{
      fieldName: string;
      oldValue: string | null;
      newValue: string | null;
    }>,
  ) {
    const { id: userId } = req.userDetails;

    try {
      if (!Array.isArray(updateData) || updateData.length === 0) {
        throw new BadRequestException("Invalid or empty updateData array.");
      }

      // Validate each change
      const validChanges = updateData.filter(
        (change) =>
          change.fieldName &&
          change.oldValue !== undefined &&
          change.newValue !== undefined,
      );

      if (validChanges.length === 0) {
        throw new BadRequestException(
          "No valid changes provided in updateData.",
        );
      }

      // Log all valid changes
      await this.prisma.issueHistory.createMany({
        data: validChanges.map((change) => ({
          issueId,
          userId,
          fieldName: change.fieldName,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
      });

      return {
        message: `${validChanges.length} change(s) logged successfully`,
        data: validChanges,
      };
    } catch (error) {
      console.error("Failed to log issue history:", error);
      throw error;
    }
  }

  async getIssuesHistory(
    projectId: string,
    page: number = 1,
    limit: number = 10,
    type?: string, // "ISSUES" | "CHECKLIST"
  ) {
    try {
      const offset = (page - 1) * limit;

      const baseWhere: any = {
        NOT: {
          oldValue: null,
          newValue: null,
        },
      };

      // Apply type-specific filtering
      if (type === "ISSUES") {
        baseWhere.type = "ISSUES";
        baseWhere.issue = { projectId };
      } else if (type === "CHECKLIST") {
        baseWhere.type = "CHECKLIST";
        baseWhere.checklistItem = {
          projectChecklist: { projectId },
        };
      } else {
        // Include both types for the project
        baseWhere.OR = [
          {
            type: "ISSUES",
            issue: { projectId },
          },
          {
            type: "CHECKLIST",
            checklistItem: {
              projectChecklist: { projectId },
            },
          },
        ];
      }

      const logs = await this.prisma.issueHistory.findMany({
        where: baseWhere,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
          issue: { select: { id: true, title: true } },
          checklistItem: { select: { id: true, question: true } },
        },
      });

      // Collect file references
      const fileIds = [
        ...new Set(
          logs
            .filter(
              (log) =>
                log.type === "CHECKLIST" &&
                log.fieldName === "attachmentFileId",
            )
            .flatMap((log) => [log.oldValue, log.newValue])
            .filter(Boolean),
        ),
      ];

      const fileMap = fileIds.length
        ? Object.fromEntries(
            (
              await this.prisma.checklistFile.findMany({
                where: { id: { in: fileIds } },
                select: { id: true, filePath: true },
              })
            ).map((file) => [file.id, file.filePath]),
          )
        : {};

      // Add file paths to applicable logs
      const enrichedLogs = logs.map((log) =>
        log.type === "CHECKLIST" && log.fieldName === "attachmentFileId"
          ? {
              ...log,
              oldFilePath: fileMap[log.oldValue] || null,
              newFilePath: fileMap[log.newValue] || null,
            }
          : log,
      );

      const total = await this.prisma.issueHistory.count({ where: baseWhere });

      return {
        message: "History logs fetched successfully",
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          history: enrichedLogs,
        },
      };
    } catch (error) {
      this.logger.error("Failed to fetch issue/checklist history logs", error);
      throw error;
    }
  }

  async assignProject(body: { projectId: string; userIds: string[] }) {
    const { projectId, userIds } = body;

    try {
      // 1) Verify project exists and grab its timeline
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { startDate: true, endDate: true },
      });
      if (!project) {
        throw new NotFoundException("Project not found");
      }
      const { startDate: startDt, endDate: endDt } = project;

      // 2) Conflict check: make sure none of these users is already booked
      if (startDt && endDt && userIds.length > 0) {
        const conflicts = await this.prisma.availability.findMany({
          where: {
            userId: { in: userIds },
            projectId: { not: projectId },
            AND: [{ startDate: { lte: endDt } }, { endDate: { gte: startDt } }],
          },
          select: {
            user: {
              select: { displayName: true },
            },
          },
        });

        // if (conflicts.length) {
        //   const names = Array.from(
        //     new Set(conflicts.map((c) => c.user.displayName)),
        //   );
        //   throw new BadRequestException(
        //     `Cannot assign users [${names.join(
        //       ", ",
        //     )}] — they’re already booked in that timeframe.`,
        //   );
        // }
      }

      // 3) Fetch previous assignments so we can reconcile Availability afterward
      const prev = await this.prisma.projectAssignment.findMany({
        where: { projectId },
        select: { userId: true },
      });
      const prevUserIds = prev.map((a) => a.userId);

      // 4) Delete old assignments
      await this.prisma.projectAssignment.deleteMany({
        where: { projectId },
      });

      // 5) Create new assignments
      await this.prisma.projectAssignment.createMany({
        data: userIds.map((uid) => ({
          projectId,
          userId: uid,
        })),
        skipDuplicates: true,
      });

      // 6) Reconcile Availability rows:

      // 6a) Remove availabilities for users no longer on the project
      const removed = prevUserIds.filter((uid) => !userIds.includes(uid));
      if (removed.length) {
        await this.prisma.availability.deleteMany({
          where: {
            projectId,
            userId: { in: removed },
          },
        });
      }

      // 6b) Seed availabilities for newly added users
      const added = userIds.filter((uid) => !prevUserIds.includes(uid));
      if (added.length && startDt && endDt) {
        await this.prisma.availability.createMany({
          data: added.map((uid) => ({
            projectId,
            userId: uid,
            startDate: startDt,
            endDate: endDt,
            startWeek: getISOWeek(startDt),
            endWeek: getISOWeek(endDt),
          })),
          skipDuplicates: true,
        });
      }

      this.logger.log(
        `Project ${projectId} assigned to ${userIds.length} users`,
      );
      return { message: "Project assigned successfully" };
    } catch (error) {
      this.logger.error("Failed to assign project", error);
      throw error;
    }
  }

  async removeAssignedUser(body: { projectId: string; userId: string }) {
    const { projectId, userId } = body;

    // 1) Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    // 2) Verify the assignment exists
    const assignment = await this.prisma.projectAssignment.findFirst({
      where: { projectId, userId },
    });
    if (!assignment) {
      throw new BadRequestException("User is not assigned to this project");
    }

    // 3) Delete assignment + availability in one transaction
    await this.prisma.$transaction([
      this.prisma.projectAssignment.delete({
        where: {
          projectId_userId: { projectId, userId },
        },
      }),
      this.prisma.availability.deleteMany({
        where: { projectId, userId },
      }),
    ]);

    this.logger.log(
      `User ${userId} removed from project ${projectId} (and availability cleaned up)`,
    );

    return {
      message: "User successfully unassigned from the project",
    };
  }

  async deleteFile(fileId: string, type: "project" | "issue" | "order") {
    try {
      // Fetch file record
      const file =
        type === "project" || type === "order"
          ? await this.prisma.file.findUnique({ where: { id: fileId } })
          : await this.prisma.issueFile.findUnique({ where: { id: fileId } });

      if (!file) throw new NotFoundException("File not found!");

      // Compute safe absolute path
      const filePath = join(".", file.filePath); // stored relative like uploads/projects/xxx.pdf

      // Try deleting the physical file
      try {
        await fs.unlink(filePath);
        this.logger.log(`Deleted file from disk: ${filePath}`);
      } catch (err: any) {
        // If file missing, warn but continue to DB cleanup
        this.logger.warn(
          `File not found on disk, skipping unlink: ${filePath}`,
        );
      }

      // Delete DB record
      if (type === "issue") {
        await this.prisma.issueFile.delete({ where: { id: fileId } });
      } else {
        await this.prisma.file.delete({ where: { id: fileId } });
      }

      return { message: "FILE_DELETED", fileId };
    } catch (error) {
      this.logger.error(`Error deleting file: ${error.message}`);
      throw error;
    }
  }
}
