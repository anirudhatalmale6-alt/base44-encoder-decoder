using System;
using System.IO;

namespace Base44;

/// <summary>
/// Base44 encoder/decoder.
///
/// Scheme (RFC 9285 "Base45" generalised to a 44-symbol alphabet):
///   - Input is processed two bytes at a time. A pair (a, b) is treated as the
///     16-bit number n = a*256 + b (0..65535) and written as THREE base-44
///     digits, least-significant digit first. 44^3 = 85184 > 65535, so three
///     digits always suffice.
///   - A single trailing byte a (0..255) is written as TWO base-44 digits,
///     least-significant first. 44^2 = 1936 > 255, so two digits suffice.
///
/// Because of this, a valid Base44 stream always has length % 3 == 0 or == 2.
/// A remainder of 1 character is malformed.
///
/// The alphabet below is the single source of truth. To match a different
/// Base44 variant, change ONLY this string (it must contain 44 distinct
/// characters); everything else adapts automatically.
/// </summary>
public static class Base44Codec
{
    public const string Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$%*+-./:";

    private const int Base = 44;

    // Reverse lookup: character -> value (0..43), or -1 if not in the alphabet.
    private static readonly sbyte[] Decode = BuildDecodeTable();

    static Base44Codec()
    {
        if (Alphabet.Length != Base)
            throw new InvalidOperationException(
                $"Base44 alphabet must contain exactly {Base} characters, found {Alphabet.Length}.");
    }

    private static sbyte[] BuildDecodeTable()
    {
        var table = new sbyte[128];
        for (int i = 0; i < table.Length; i++) table[i] = -1;
        for (int i = 0; i < Alphabet.Length; i++)
        {
            char c = Alphabet[i];
            if (c >= 128)
                throw new InvalidOperationException("Base44 alphabet must be ASCII.");
            if (table[c] != -1)
                throw new InvalidOperationException($"Duplicate character '{c}' in Base44 alphabet.");
            table[c] = (sbyte)i;
        }
        return table;
    }

    /// <summary>Encode an in-memory byte array to a Base44 string.</summary>
    public static string Encode(ReadOnlySpan<byte> data)
    {
        // 2 bytes -> 3 chars, 1 leftover byte -> 2 chars.
        int fullPairs = data.Length / 2;
        int outLen = fullPairs * 3 + ((data.Length % 2) * 2);
        var buffer = new char[outLen];
        int o = 0;
        int i = 0;
        for (; i + 1 < data.Length; i += 2)
        {
            int n = (data[i] << 8) | data[i + 1];
            buffer[o++] = Alphabet[n % Base]; n /= Base;
            buffer[o++] = Alphabet[n % Base]; n /= Base;
            buffer[o++] = Alphabet[n];
        }
        if (i < data.Length)
        {
            int n = data[i];
            buffer[o++] = Alphabet[n % Base]; n /= Base;
            buffer[o++] = Alphabet[n];
        }
        return new string(buffer, 0, o);
    }

    /// <summary>Decode a Base44 string back to the original bytes.</summary>
    /// <exception cref="FormatException">Thrown when the input is malformed.</exception>
    public static byte[] Decode_(string text)
    {
        using var ms = new MemoryStream();
        var d = new StreamingDecoder();
        d.Push(text.AsSpan(), ms);
        d.Finish(ms);
        return ms.ToArray();
    }

    // ---------------------------------------------------------------------
    // Streaming primitives (used by the CLI to handle arbitrarily large files
    // with flat memory usage).
    // ---------------------------------------------------------------------

    /// <summary>
    /// Streaming encoder. Feed bytes with <see cref="Push"/> in any chunk sizes;
    /// call <see cref="Finish"/> once at the end to flush a possible odd byte.
    /// </summary>
    public sealed class StreamingEncoder
    {
        private bool _hasCarry;
        private byte _carry;

        public void Push(ReadOnlySpan<byte> data, TextWriter output)
        {
            int i = 0;
            if (_hasCarry && data.Length > 0)
            {
                int n = (_carry << 8) | data[0];
                WriteTriplet(output, n);
                _hasCarry = false;
                i = 1;
            }
            for (; i + 1 < data.Length; i += 2)
            {
                int n = (data[i] << 8) | data[i + 1];
                WriteTriplet(output, n);
            }
            if (i < data.Length)
            {
                _carry = data[i];
                _hasCarry = true;
            }
        }

        public void Finish(TextWriter output)
        {
            if (_hasCarry)
            {
                int n = _carry;
                output.Write(Alphabet[n % Base]); n /= Base;
                output.Write(Alphabet[n]);
                _hasCarry = false;
            }
        }

        private static void WriteTriplet(TextWriter output, int n)
        {
            output.Write(Alphabet[n % Base]); n /= Base;
            output.Write(Alphabet[n % Base]); n /= Base;
            output.Write(Alphabet[n]);
        }
    }

    /// <summary>
    /// Streaming decoder. Feed characters with <see cref="Push"/>; call
    /// <see cref="Finish"/> once at the end to validate the final group.
    /// Whitespace (space, tab, CR, LF) is ignored so wrapped/piped text decodes
    /// cleanly. Any other character outside the alphabet is an error.
    /// </summary>
    public sealed class StreamingDecoder
    {
        private readonly int[] _group = new int[3];
        private int _count;

        public void Push(ReadOnlySpan<char> text, Stream output)
        {
            foreach (char c in text)
            {
                if (c == ' ' || c == '\r' || c == '\n' || c == '\t') continue;
                if (c >= 128 || Decode[c] < 0)
                    throw new FormatException($"Invalid Base44 character '{Printable(c)}' (0x{(int)c:X2}).");

                _group[_count++] = Decode[c];
                if (_count == 3)
                {
                    int n = _group[0] + _group[1] * Base + _group[2] * Base * Base;
                    if (n > 0xFFFF)
                        throw new FormatException(
                            $"Malformed Base44: 3-character group decodes to {n}, which exceeds 65535.");
                    output.WriteByte((byte)(n >> 8));
                    output.WriteByte((byte)(n & 0xFF));
                    _count = 0;
                }
            }
        }

        public void Finish(Stream output)
        {
            if (_count == 0) return;
            if (_count == 1)
                throw new FormatException(
                    "Malformed Base44: input ends with a single leftover character (a group must be 2 or 3 characters).");
            // _count == 2  -> one trailing byte
            int n = _group[0] + _group[1] * Base;
            if (n > 0xFF)
                throw new FormatException(
                    $"Malformed Base44: final 2-character group decodes to {n}, which exceeds 255.");
            output.WriteByte((byte)n);
            _count = 0;
        }

        private static string Printable(char c) =>
            c is >= ' ' and < (char)127 ? c.ToString() : $"\\u{(int)c:X4}";
    }
}
