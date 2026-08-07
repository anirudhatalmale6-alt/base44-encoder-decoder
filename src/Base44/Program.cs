using System;
using System.IO;

namespace Base44;

/// <summary>
/// Command-line front-end for the Base44 codec.
///
/// Usage:
///   base44 encode [-i in] [-o out]
///   base44 decode [-i in] [-o out]
///
/// Reads from a file (-i/--input) or stdin, writes to a file (-o/--output) or
/// stdout, so it composes like the standard base64 utility.
/// </summary>
public static class Program
{
    private const int BufferSize = 64 * 1024; // 64 KiB, flat memory regardless of file size.

    public static int Main(string[] args)
    {
        try
        {
            return Run(args);
        }
        catch (FormatException ex)
        {
            // Malformed input: user-facing, clean message, no stack trace.
            Console.Error.WriteLine($"base44: error: {ex.Message}");
            return 2;
        }
        catch (FileNotFoundException ex)
        {
            Console.Error.WriteLine($"base44: error: input file not found: {ex.FileName}");
            return 3;
        }
        catch (IOException ex)
        {
            Console.Error.WriteLine($"base44: error: {ex.Message}");
            return 4;
        }
    }

    private static int Run(string[] args)
    {
        if (args.Length == 0 ||
            args[0] is "-h" or "--help" or "help")
        {
            PrintUsage(Console.Out);
            return args.Length == 0 ? 1 : 0;
        }
        if (args[0] is "-v" or "--version" or "version")
        {
            Console.Out.WriteLine("base44 1.0.0");
            return 0;
        }

        string mode = args[0].ToLowerInvariant();
        if (mode is not ("encode" or "decode" or "e" or "d"))
        {
            Console.Error.WriteLine($"base44: error: unknown command '{args[0]}'. Try 'base44 --help'.");
            return 1;
        }
        bool encode = mode is "encode" or "e";

        string? inputPath = null;
        string? outputPath = null;
        for (int i = 1; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "-i" or "--input":
                    inputPath = RequireValue(args, ref i, "-i/--input");
                    break;
                case "-o" or "--output":
                    outputPath = RequireValue(args, ref i, "-o/--output");
                    break;
                default:
                    Console.Error.WriteLine($"base44: error: unexpected argument '{args[i]}'.");
                    return 1;
            }
        }

        using Stream input = inputPath is null
            ? Console.OpenStandardInput()
            : File.Open(inputPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        using Stream output = outputPath is null
            ? Console.OpenStandardOutput()
            : File.Create(outputPath);

        if (encode)
            EncodeStream(input, output);
        else
            DecodeStream(input, output);

        output.Flush();
        return 0;
    }

    private static void EncodeStream(Stream input, Stream output)
    {
        var writer = new StreamWriter(output, System.Text.Encoding.ASCII, BufferSize) { AutoFlush = false };
        var encoder = new Base44Codec.StreamingEncoder();
        var buffer = new byte[BufferSize];
        int read;
        while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
            encoder.Push(buffer.AsSpan(0, read), writer);
        encoder.Finish(writer);
        writer.Flush();
    }

    private static void DecodeStream(Stream input, Stream output)
    {
        var reader = new StreamReader(input, System.Text.Encoding.ASCII, false, BufferSize);
        var decoder = new Base44Codec.StreamingDecoder();
        var buffer = new char[BufferSize];
        int read;
        while ((read = reader.Read(buffer, 0, buffer.Length)) > 0)
            decoder.Push(buffer.AsSpan(0, read), output);
        decoder.Finish(output);
    }

    private static string RequireValue(string[] args, ref int i, string name)
    {
        if (i + 1 >= args.Length)
            throw new FormatException($"option {name} requires a value.");
        return args[++i];
    }

    private static void PrintUsage(TextWriter w)
    {
        w.WriteLine("base44 - Base44 encoder/decoder");
        w.WriteLine();
        w.WriteLine("USAGE:");
        w.WriteLine("  base44 encode [-i <file>] [-o <file>]");
        w.WriteLine("  base44 decode [-i <file>] [-o <file>]");
        w.WriteLine();
        w.WriteLine("OPTIONS:");
        w.WriteLine("  -i, --input <file>    Read from <file> instead of stdin.");
        w.WriteLine("  -o, --output <file>   Write to <file> instead of stdout.");
        w.WriteLine("  -h, --help            Show this help.");
        w.WriteLine("  -v, --version         Show version.");
        w.WriteLine();
        w.WriteLine("EXAMPLES:");
        w.WriteLine("  echo -n \"Hello\" | base44 encode");
        w.WriteLine("  base44 encode -i photo.jpg -o photo.b44");
        w.WriteLine("  base44 decode -i photo.b44 -o photo.jpg");
    }
}
