/*
 * colorblind.js - Browser port of https://github.com/skratchdot/color-blind
 *
 * Original algorithm by Matthew Wickline and the
 * Human-Computer Interaction Resource Network (http://hcirn.com/).
 *
 * Licensed under CC-BY-SA-4.0
 * https://creativecommons.org/licenses/by-sa/4.0/
 *
 * Ported from CommonJS to a browser global (window.blinder) with no
 * dependencies. Uses chroma.js for hex parsing if available.
 */
(function (global) {
    'use strict';

    var colorProfile = 'sRGB';
    var gammaCorrection = 2.2;

    var matrixXyzRgb = [
         3.240712470389558, -0.969259258688888,  0.05563600315398933,
        -1.5372626602963142, 1.875996969313966, -0.2039948802843549,
        -0.49857440415943116, 0.041556132211625726, 1.0570636917433989
    ];

    var matrixRgbXyz = [
        0.41242371206635076, 0.21265606784927693, 0.019331987577444885,
        0.3575793401363035,  0.715157818248362,   0.11919267420354762,
        0.1804662232369621,  0.0721864539171564,  0.9504491124870351
    ];

    // Confusion line data: xy confusion point, slope (m), y-intercept (yi)
    var blinderData = {
        protan: { x: 0.7465,  y:  0.2535, m:  1.273463, yi: -0.073894 },
        deutan: { x: 1.4,     y: -0.4,    m:  0.968437, yi:  0.003331 },
        tritan: { x: 0.1748,  y:  0,      m:  0.062921, yi:  0.292119 }
    };

    function convertRgbToXyz(o) {
        var M = matrixRgbXyz;
        var R = o.R / 255;
        var G = o.G / 255;
        var B = o.B / 255;
        if (colorProfile === 'sRGB') {
            R = (R > 0.04045) ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
            G = (G > 0.04045) ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
            B = (B > 0.04045) ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;
        } else {
            R = Math.pow(R, gammaCorrection);
            G = Math.pow(G, gammaCorrection);
            B = Math.pow(B, gammaCorrection);
        }
        return {
            X: R * M[0] + G * M[3] + B * M[6],
            Y: R * M[1] + G * M[4] + B * M[7],
            Z: R * M[2] + G * M[5] + B * M[8]
        };
    }

    function convertXyzToXyy(o) {
        var n = o.X + o.Y + o.Z;
        if (n === 0) return { x: 0, y: 0, Y: o.Y };
        return { x: o.X / n, y: o.Y / n, Y: o.Y };
    }

    function simulate(rgb, type, anomalize) {
        var z, v, n, line, c, slope, yi, dx, dy, dY, dX, dZ, dR, dG, dB, _r, _g, _b, ngx, ngz, M, adjust;

        // Achromatopsia / Achromatomaly
        if (type === 'achroma') {
            z = rgb.R * 0.212656 + rgb.G * 0.715158 + rgb.B * 0.072186;
            z = { R: z, G: z, B: z };
            if (anomalize) {
                v = 1.75; n = v + 1;
                z.R = (v * z.R + rgb.R) / n;
                z.G = (v * z.G + rgb.G) / n;
                z.B = (v * z.B + rgb.B) / n;
            }
            return z;
        }

        line = blinderData[type];
        c    = convertXyzToXyy(convertRgbToXyz(rgb));

        // Confusion line between source color and confusion point
        slope = (c.y - line.y) / (c.x - line.x);
        yi    = c.y - c.x * slope;

        // Change in x/y to reach the color axis (no Y change)
        dx = (line.yi - yi) / (slope - line.m);
        dy = slope * dx + yi;
        dY = 0;

        // Simulated color XYZ
        z   = {};
        z.X = dx * c.Y / dy;
        z.Y = c.Y;
        z.Z = (1 - (dx + dy)) * c.Y / dy;

        // Shift toward neutral grey to fit in RGB gamut
        ngx = 0.312713 * c.Y / 0.329016;
        ngz = 0.358271 * c.Y / 0.329016;
        dX  = ngx - z.X;
        dZ  = ngz - z.Z;

        M  = matrixXyzRgb;
        dR = dX * M[0] + dY * M[3] + dZ * M[6];
        dG = dX * M[1] + dY * M[4] + dZ * M[7];
        dB = dX * M[2] + dY * M[5] + dZ * M[8];

        z.R = z.X * M[0] + z.Y * M[3] + z.Z * M[6];
        z.G = z.X * M[1] + z.Y * M[4] + z.Z * M[7];
        z.B = z.X * M[2] + z.Y * M[5] + z.Z * M[8];

        _r = ((z.R < 0 ? 0 : 1) - z.R) / dR;
        _g = ((z.G < 0 ? 0 : 1) - z.G) / dG;
        _b = ((z.B < 0 ? 0 : 1) - z.B) / dB;
        _r = (_r > 1 || _r < 0) ? 0 : _r;
        _g = (_g > 1 || _g < 0) ? 0 : _g;
        _b = (_b > 1 || _b < 0) ? 0 : _b;

        adjust = Math.max(_r, _g, _b);
        z.R += adjust * dR;
        z.G += adjust * dG;
        z.B += adjust * dB;

        // Apply gamma and clamp
        z.R = 255 * (z.R <= 0 ? 0 : z.R >= 1 ? 1 : Math.pow(z.R, 1 / gammaCorrection));
        z.G = 255 * (z.G <= 0 ? 0 : z.G >= 1 ? 1 : Math.pow(z.G, 1 / gammaCorrection));
        z.B = 255 * (z.B <= 0 ? 0 : z.B >= 1 ? 1 : Math.pow(z.B, 1 / gammaCorrection));

        if (anomalize) {
            v = 1.75; n = v + 1;
            z.R = (v * z.R + rgb.R) / n;
            z.G = (v * z.G + rgb.G) / n;
            z.B = (v * z.B + rgb.B) / n;
        }

        return z;
    }

    function toHexByte(v) {
        var h = Math.round(v % 256).toString(16);
        return h.length === 1 ? '0' + h : h;
    }

    function rgbToHex(rgb) {
        return '#' + toHexByte(rgb.R || 0) + toHexByte(rgb.G || 0) + toHexByte(rgb.B || 0);
    }

    function parseColor(colorString) {
        if (typeof chroma !== 'undefined') {
            var c = chroma(colorString).rgb();
            return { R: c[0], G: c[1], B: c[2] };
        }
        // Fallback: parse 6-digit hex
        var hex = colorString.replace(/^#/, '');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        return {
            R: parseInt(hex.slice(0, 2), 16),
            G: parseInt(hex.slice(2, 4), 16),
            B: parseInt(hex.slice(4, 6), 16)
        };
    }

    function makeBlinder(type, anomalize) {
        return function (colorString) {
            try {
                var rgb    = parseColor(colorString);
                var result = simulate(rgb, type, anomalize);
                return rgbToHex(result);
            } catch (e) {
                return colorString;
            }
        };
    }

    global.blinder = {
        protanomaly:   makeBlinder('protan', true),
        protanopia:    makeBlinder('protan', false),
        deuteranomaly: makeBlinder('deutan', true),
        deuteranopia:  makeBlinder('deutan', false),
        tritanomaly:   makeBlinder('tritan', true),
        tritanopia:    makeBlinder('tritan', false),
        achromatomaly: makeBlinder('achroma', true),
        achromatopsia: makeBlinder('achroma', false),
        highContrast: function (colorString) {
            try {
                if (typeof chroma === 'undefined') return colorString;
                var c   = chroma(colorString);
                var hsl = c.hsl();
                var h   = isNaN(hsl[0]) ? 0 : hsl[0];
                var s   = hsl[1] || 0;
                var l   = hsl[2] || 0;
                // Boost saturation
                s = Math.min(1, s + 0.4);
                // Push lightness toward extremes
                l = l < 0.5 ? Math.max(0.1, l - 0.15) : Math.min(0.95, l + 0.1);
                return chroma.hsl(h, s, l).hex();
            } catch (e) {
                return colorString;
            }
        }
    };

}(window));
