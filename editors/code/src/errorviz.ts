//@ts-ignore
import { createSVGWindow } from "svgdom";
import { SVG, registerWindow, Svg } from "@svgdotjs/svg.js";
import * as vscode from "vscode";
import { log } from "./util";

function svg2uri(svg: Svg): vscode.Uri {
    const uri = `data:image/svg+xml;base64,${Buffer.from(svg.svg()).toString("base64")}`;
    return vscode.Uri.parse(uri);
}

/** Generates an array of numbers in the interval [from, to) */
function range(from: number, to: number): ReadonlyArray<number> {
    return [...Array(to - from).keys()].map((i) => i + from);
}

/**
 *  Gets the difference of line width of the longest line from lines `de` to
 * `au` and the width of `de` in character count
 */
function getXshift(editor: vscode.TextEditor, de: number, au: number): number {
    const longest = Math.max(
        ...range(de, au + 1).map((li) => editor.document.lineAt(li).text.length)
    );
    const first = editor.document.lineAt(de).text.length;
    return longest - first;
}

function newDecorationType(): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
    });
}

function image2decoration(image: Svg, line: number): vscode.DecorationOptions {
    return {
        range: new vscode.Range(line, 0, line, 0),
        renderOptions: {
            after: <any>{
                contentIconPath: svg2uri(image),
                verticalAlign: "text-top",
            },
        },
        hoverMessage: new vscode.MarkdownString("click for visualization"),
    };
}

function newSvg(width: number, height: number): Svg {
    const window = createSVGWindow();
    const document = window.document;
    registerWindow(window, document);
    return (<Svg>SVG(document.documentElement)).size(width, height);
}

type DiagnosticInfo = {
    diagnostics: vscode.Diagnostic;
    displayed: boolean;
    dectype: vscode.TextEditorDecorationType | null;
    svg: vscode.DecorationOptions | null;
};
export const G = {
    fontsize: vscode.workspace.getConfiguration("editor").get<number>("fontSize") ?? 14,
    charwidth: 10,
    lineheight: 0,
    dectype: vscode.window.createTextEditorDecorationType({ isWholeLine: true }),
    diags: new Map<number, DiagnosticInfo>(),
    showTriangles() {
        const sidelength = 9;
        const sign = newSvg(sidelength, sidelength * 0.866);
        sign.path(`M${sidelength / 2},0 L0,${sidelength * 0.866} l${sidelength},0`).fill("#ff3300");
        const dtype = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            gutterIconPath: svg2uri(sign),
        });
        const ranges = Array.from(this.diags.keys()).map((k) => new vscode.Range(k, 0, k, 0));
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            log.error("no editor");
            return;
        }
        editor.setDecorations(dtype, ranges);
    },
    hideDiag(lineno: number) {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            log.error("no editor");
            return;
        }
        const diaginfo = this.diags.get(lineno);
        if (diaginfo === undefined) {
            log.error(`diags pour ${lineno} n'existe pas`);
            return;
        }
        const diag = diaginfo.diagnostics;
        if (typeof diag.code === "number" || typeof diag.code === "string") {
            log.error("unexpected diag.code type");
            return;
        }
        if (diaginfo.dectype !== null) {
            editor.setDecorations(diaginfo.dectype, []);
        }
        diaginfo.displayed = false;
    },
    showDiag(lineno: number) {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            log.error("no editor");
            return;
        }
        const diaginfo = this.diags.get(lineno);
        if (diaginfo === undefined) {
            log.error(`diags pour ${lineno} n'existe pas`);
            return;
        }
        const diag = diaginfo.diagnostics;
        if (typeof diag.code === "number" || typeof diag.code === "string") {
            log.error("unexpected diag.code type");
            return;
        }
        // clear all visualizations
        // for (const v of this.diags.values()) {
        //     v.displayed = false;
        //     if (v.dectype !== null) {
        //         editor.setDecorations(v.dectype, []);
        //     }
        // }
        // get the diaginfo.svg in this switch block
        switch (diag.code!.value) {
            case "E0502": {
                const varname = /^cannot borrow `\*?(.+)` as mutable/.exec(diag.message)![1];
                const eline = diag.range.start.line;
                const fromline = diag.relatedInformation?.filter((d) =>
                    d.message.endsWith("borrow occurs here")
                )[0]?.location.range.start.line;
                const toline = diag.relatedInformation?.filter((d) =>
                    d.message.endsWith("borrow later used here")
                )[0]?.location.range.end.line;
                if (varname === undefined || fromline === undefined || toline === undefined) {
                    return;
                }
                const xshift = getXshift(editor, fromline, toline) * this.charwidth;
                diaginfo.svg = image502(xshift, fromline, toline, eline, varname);
                break;
            }
            case "E0503": {
                const varname = /^cannot use `(.+)` because it was mutably borrowed/.exec(
                    diag.message
                )![1];
                const eline = diag.range.start.line;
                const fromline = diag.relatedInformation?.filter((d) =>
                    d.message.endsWith("occurs here")
                )[0]?.location.range.start.line;
                const toline = diag.relatedInformation?.filter((d) =>
                    d.message.endsWith("borrow later used here")
                )[0]?.location.range.end.line;
                if (varname === undefined || fromline === undefined || toline === undefined) {
                    return;
                }
                const xshift = getXshift(editor, fromline, toline) * this.charwidth;
                diaginfo.svg = image503(xshift, fromline, toline, eline, varname);
                break;
            }
            case "E0505": {
                const varname = /^cannot move out of `(.+)` because it is borrowed/.exec(
                    diag.message
                )![1];
                const eline = diag.range.start.line;
                const fromline = diag.relatedInformation?.filter((d) =>
                    d.message.endsWith("occurs here")
                )[0]?.location.range.start.line;
                const toline = diag.relatedInformation?.filter((d) =>
                    d.message.endsWith("borrow later used here")
                )[0]?.location.range.end.line;
                if (varname === undefined || fromline === undefined || toline === undefined) {
                    return;
                }
                const xshift = getXshift(editor, fromline, toline) * this.charwidth;
                diaginfo.svg = image505(xshift, fromline, toline, eline, varname, "something");
                break;
            }
            default:
                log.info(`unsupported error code ${diag.code!.value}`);
                return;
        }
        if (diaginfo.dectype === null) {
            diaginfo.dectype = newDecorationType();
        }
        diaginfo.displayed = true;
        editor.setDecorations(diaginfo.dectype, [diaginfo.svg]);
    },
};
G.lineheight = Math.max(8, Math.round(1.35 * G.fontsize));

/// line numbers are 0-indexed
function regionPointConflict(
    xshift: number,
    fromline: number,
    toline: number,
    errorline: number,
    regiontext: string,
    pointtext: string,
    tip: string
) {
    const svgimg = newSvg(800, G.lineheight * (toline - fromline + 2));
    const canvas = svgimg.group().attr({
        fill: "transparent",
        transform: `translate(${xshift}, 0)`,
        style: `font-family: monospace; font-size: ${G.fontsize}px; overflow: visible;`,
    });
    canvas.path(`M0,0 L10,0 l0,${G.lineheight * (toline - fromline + 1)} l-10,0`).stroke("cyan");
    canvas.plain(regiontext).fill("cyan").attr({ x: 20, y: G.fontsize });
    canvas.path(`M0,${(errorline - fromline + 0.5) * G.lineheight} l20,0`).stroke("red");
    canvas
        .plain(pointtext)
        .fill("red")
        .attr({ x: 30, y: G.fontsize + G.lineheight * (errorline - fromline) });
    canvas
        .text(tip)
        .fill("white")
        .attr({ x: 20, y: G.fontsize + G.lineheight * (toline - fromline) });
    return image2decoration(svgimg, fromline);
}

export function image502(
    xshift: number,
    fromline: number,
    toline: number,
    errorline: number,
    borrowed: string
): vscode.DecorationOptions {
    const imm = `\`${borrowed}\` borrowed immutably in this region`;
    const mut = `\`${borrowed}\` borrowed mutably here, conflicting with the immutable borrow`;
    const tip = "tip: move the mutable borrow out of the immutable borrow area";
    return regionPointConflict(xshift, fromline, toline, errorline, imm, mut, tip);
}

export function image503(
    xshift: number,
    fromline: number,
    toline: number,
    errorline: number,
    borrowed: string
): vscode.DecorationOptions {
    const imm = `\`${borrowed}\` borrowed mutably in this region`;
    const mut = `\`${borrowed}\` used here, conflicting with the borrow`;
    const tip = `tip: move the use of \`${borrowed}\` out of the borrow region`;
    return regionPointConflict(xshift, fromline, toline, errorline, imm, mut, tip);
}

export function image505(
    xshift: number,
    fromline: number,
    toline: number,
    errorline: number,
    borrowed: string,
    movein: string
): vscode.DecorationOptions {
    const imm = `\`${borrowed}\` borrowed in this region`;
    const mut = `\`${borrowed}\` moved into ${movein}`;
    const tip =
        "tip: the move of a value should happen when it is not borrowed.\nafter the move, the value can no longer be borrowed";
    return regionPointConflict(xshift, fromline, toline, errorline, imm, mut, tip);
}

function image597(): Svg {
    const svgimg = newSvg(800, 7 * G.lineheight);
    const canvas = svgimg.group().attr({
        fill: "transparent",
        transform: "translate(80, 0)",
        style: `font-family: monospace; font-size: ${G.fontsize}px; overflow: visible;`,
    });
    canvas.path(`M0,0 L10,0 l0,${G.lineheight * 3} l-10,0`).stroke("cyan");
    canvas
        .plain("`y`'s lifetime")
        .fill("cyan")
        .attr({ x: 20, y: 1.5 * G.lineheight });
    canvas
        .plain("`x.x` still refers to `y`, but `y` doesn't exist anymore")
        .fill("red")
        .attr({ x: 0, y: G.fontsize + 3 * G.lineheight });
    return svgimg;
}
