using System;
using System.IO;
using System.Text;
using Base44;
using Xunit;

namespace Base44.Tests;

public class Base44CodecTests
{
    // ---- Alphabet sanity ------------------------------------------------

    [Fact]
    public void Alphabet_Has_44_Distinct_Ascii_Characters()
    {
        Assert.Equal(44, Base44Codec.Alphabet.Length);
        Assert.Equal(44, new System.Collections.Generic.HashSet<char>(Base44Codec.Alphabet).Count);
        foreach (char c in Base44Codec.Alphabet)
            Assert.InRange(c, ' ', (char)126);
    }

    // ---- Round-trip integrity ------------------------------------------

    [Fact]
    public void RoundTrip_Empty()
    {
        var data = Array.Empty<byte>();
        Assert.Equal("", Base44Codec.Encode(data));
        Assert.Equal(data, Base44Codec.Decode_(""));
    }

    [Theory]
    [InlineData("A")]
    [InlineData("AB")]
    [InlineData("ABC")]
    [InlineData("Hello, World!")]
    [InlineData("The quick brown fox jumps over the lazy dog")]
    public void RoundTrip_Text(string text)
    {
        var data = Encoding.UTF8.GetBytes(text);
        string encoded = Base44Codec.Encode(data);
        byte[] decoded = Base44Codec.Decode_(encoded);
        Assert.Equal(data, decoded);
    }

    [Fact]
    public void Encoded_Output_Uses_Only_Alphabet_Characters()
    {
        var data = Encoding.UTF8.GetBytes("Base44 round-trip check 123!@#");
        string encoded = Base44Codec.Encode(data);
        foreach (char c in encoded)
            Assert.Contains(c, Base44Codec.Alphabet);
    }

    [Fact]
    public void RoundTrip_All_Single_Bytes()
    {
        for (int b = 0; b < 256; b++)
        {
            var data = new[] { (byte)b };
            string encoded = Base44Codec.Encode(data);
            Assert.Equal(2, encoded.Length); // single byte -> 2 chars
            Assert.Equal(data, Base44Codec.Decode_(encoded));
        }
    }

    [Fact]
    public void RoundTrip_All_Byte_Pairs()
    {
        for (int a = 0; a < 256; a++)
        for (int b = 0; b < 256; b++)
        {
            var data = new[] { (byte)a, (byte)b };
            string encoded = Base44Codec.Encode(data);
            Assert.Equal(3, encoded.Length); // two bytes -> 3 chars
            Assert.Equal(data, Base44Codec.Decode_(encoded));
        }
    }

    [Fact]
    public void RoundTrip_Random_Binary_Various_Lengths()
    {
        // Deterministic seed so failures are reproducible.
        var rng = new Random(20260807);
        for (int len = 0; len <= 5000; len += (len < 40 ? 1 : 137))
        {
            var data = new byte[len];
            rng.NextBytes(data);
            string encoded = Base44Codec.Encode(data);
            byte[] decoded = Base44Codec.Decode_(encoded);
            Assert.Equal(data, decoded);
        }
    }

    [Fact]
    public void Output_Length_Matches_Scheme()
    {
        // 2 bytes -> 3 chars; a trailing odd byte -> +2 chars.
        for (int len = 0; len < 200; len++)
        {
            var data = new byte[len];
            int expected = (len / 2) * 3 + (len % 2) * 2;
            Assert.Equal(expected, Base44Codec.Encode(data).Length);
        }
    }

    // ---- Edge cases / malformed input ----------------------------------

    [Fact]
    public void Decode_Rejects_Invalid_Character()
    {
        // '&' is not in the alphabet.
        var ex = Assert.Throws<FormatException>(() => Base44Codec.Decode_("AB&"));
        Assert.Contains("Invalid Base44 character", ex.Message);
    }

    [Fact]
    public void Decode_Rejects_Lone_Trailing_Character()
    {
        // Valid group is 2 or 3 chars; a remainder of 1 is impossible.
        string oneExtra = Base44Codec.Encode(new byte[] { 1, 2 }) + Base44Codec.Alphabet[0];
        Assert.Equal(4, oneExtra.Length);
        var ex = Assert.Throws<FormatException>(() => Base44Codec.Decode_(oneExtra));
        Assert.Contains("single leftover character", ex.Message);
    }

    [Fact]
    public void Decode_Rejects_Triplet_Above_65535()
    {
        // Largest valid triplet encodes 65535; push one digit past it.
        // 'Z' is value 35; ":" is value 43. Build a group that overflows.
        string bad = new string(new[] { Base44Codec.Alphabet[43], Base44Codec.Alphabet[43], Base44Codec.Alphabet[43] });
        // 43 + 43*44 + 43*1936 = 85183 > 65535
        var ex = Assert.Throws<FormatException>(() => Base44Codec.Decode_(bad));
        Assert.Contains("exceeds 65535", ex.Message);
    }

    [Fact]
    public void Decode_Rejects_Final_Pair_Above_255()
    {
        // 43 + 43*44 = 1935 > 255
        string bad = new string(new[] { Base44Codec.Alphabet[43], Base44Codec.Alphabet[43] });
        var ex = Assert.Throws<FormatException>(() => Base44Codec.Decode_(bad));
        Assert.Contains("exceeds 255", ex.Message);
    }

    [Fact]
    public void Decode_Ignores_Whitespace()
    {
        var data = Encoding.UTF8.GetBytes("Wrapped input survives newlines");
        string encoded = Base44Codec.Encode(data);
        // Inject whitespace as if the text had been line-wrapped.
        var sb = new StringBuilder();
        for (int i = 0; i < encoded.Length; i++)
        {
            sb.Append(encoded[i]);
            if (i % 5 == 4) sb.Append('\n');
            if (i % 7 == 6) sb.Append(' ');
        }
        Assert.Equal(data, Base44Codec.Decode_(sb.ToString()));
    }

    // ---- Streaming matches one-shot ------------------------------------

    [Fact]
    public void Streaming_Encode_Matches_OneShot_Across_Chunk_Boundaries()
    {
        var rng = new Random(1);
        var data = new byte[1000];
        rng.NextBytes(data);
        string oneShot = Base44Codec.Encode(data);

        foreach (int chunk in new[] { 1, 2, 3, 7, 64, 999 })
        {
            var sw = new StringWriter();
            var enc = new Base44Codec.StreamingEncoder();
            for (int off = 0; off < data.Length; off += chunk)
                enc.Push(data.AsSpan(off, Math.Min(chunk, data.Length - off)), sw);
            enc.Finish(sw);
            Assert.Equal(oneShot, sw.ToString());
        }
    }

    [Fact]
    public void Streaming_Decode_Matches_OneShot_Across_Chunk_Boundaries()
    {
        var rng = new Random(2);
        var data = new byte[1000];
        rng.NextBytes(data);
        string encoded = Base44Codec.Encode(data);

        foreach (int chunk in new[] { 1, 2, 3, 5, 64, 999 })
        {
            using var ms = new MemoryStream();
            var dec = new Base44Codec.StreamingDecoder();
            for (int off = 0; off < encoded.Length; off += chunk)
                dec.Push(encoded.AsSpan(off, Math.Min(chunk, encoded.Length - off)), ms);
            dec.Finish(ms);
            Assert.Equal(data, ms.ToArray());
        }
    }
}
