using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

namespace RemoteXIconGenerator
{
    class Program
    {
        static void Main()
        {
            int size = 512;
            using (var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.Clear(Color.Transparent);

                // Background rounded squircle (matching official branding)
                using (var path = new GraphicsPath())
                {
                    int r = 110;
                    int pad = 12;
                    int w = size - (pad * 2);
                    path.AddArc(pad, pad, r, r, 180, 90);
                    path.AddArc(pad + w - r, pad, r, r, 270, 90);
                    path.AddArc(pad + w - r, pad + w - r, r, r, 0, 90);
                    path.AddArc(pad, pad + w - r, r, r, 90, 90);
                    path.CloseFigure();

                    // Deep blue gradient background
                    using (var bgBrush = new LinearGradientBrush(new Point(0, 0), new Point(size, size), 
                        Color.FromArgb(255, 0, 112, 243), Color.FromArgb(255, 6, 26, 60)))
                    {
                        g.FillPath(bgBrush, path);
                    }

                    // Subtle cyan glowing border
                    using (var borderPen = new Pen(Color.FromArgb(140, 0, 194, 255), 4))
                    {
                        g.DrawPath(borderPen, path);
                    }
                }

                // 1. Cyan Swoosh Arc
                using (var pen = new Pen(Color.FromArgb(255, 0, 194, 255), 18))
                {
                    pen.StartCap = LineCap.Round;
                    pen.EndCap = LineCap.Round;
                    // Outer arc around the R
                    g.DrawArc(pen, 70, 90, 360, 330, 110, 240);
                }

                // 2. Bold "R" Letter Shape
                using (var rPath = new GraphicsPath())
                {
                    // Main stem and loop
                    PointF[] stem = new PointF[] {
                        new PointF(135, 120),
                        new PointF(315, 120),
                        new PointF(395, 175),
                        new PointF(395, 250),
                        new PointF(345, 300),
                        new PointF(280, 315),
                        new PointF(280, 318),
                        new PointF(360, 420),
                        new PointF(295, 420),
                        new PointF(225, 318),
                        new PointF(205, 318),
                        new PointF(205, 420),
                        new PointF(135, 420)
                    };
                    rPath.AddPolygon(stem);

                    // Inner cutout of R
                    PointF[] inner = new PointF[] {
                        new PointF(205, 185),
                        new PointF(300, 185),
                        new PointF(330, 210),
                        new PointF(330, 245),
                        new PointF(300, 265),
                        new PointF(205, 265)
                    };
                    rPath.AddPolygon(inner);

                    using (var rBrush = new SolidBrush(Color.White))
                    {
                        g.FillPath(rBrush, rPath);
                    }
                }

                // 3. Dynamic Cyan Arrow Cursor pointing down-right
                using (var cursorPath = new GraphicsPath())
                {
                    PointF[] pts = new PointF[] {
                        new PointF(315, 295),
                        new PointF(415, 400),
                        new PointF(365, 405),
                        new PointF(350, 445),
                        new PointF(315, 435),
                        new PointF(330, 395),
                        new PointF(285, 390)
                    };
                    cursorPath.AddPolygon(pts);

                    using (var cBrush = new SolidBrush(Color.FromArgb(255, 0, 194, 255)))
                    {
                        g.FillPath(cBrush, cursorPath);
                    }
                    using (var cPen = new Pen(Color.FromArgb(255, 255, 255, 255), 4))
                    {
                        g.DrawPolygon(cPen, pts);
                    }
                }

                string outPng = @"C:\Users\André\projetos com IA\RemoteX\assets\icon.png";
                bmp.Save(outPng, ImageFormat.Png);

                // Save to public as well
                bmp.Save(@"C:\Users\André\projetos com IA\RemoteX\apps\desktop\public\icon.png", ImageFormat.Png);
                Console.WriteLine("HD Icon PNG rendered successfully at: " + outPng);
            }
        }
    }
}

