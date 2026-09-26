package render

import (
	"math"
	"strconv"
	"strings"
)

// exactDigits returns the leading significant digits of |v| and the decimal
// exponent of the first one. Sixty digits decide every rounding the renders
// need; JavaScript rounds from the exact binary value too.
func exactDigits(v float64) (string, int) {
	text := strconv.FormatFloat(math.Abs(v), 'e', 60, 64)
	mantissa, exponent, _ := strings.Cut(text, "e")
	exp, _ := strconv.Atoi(exponent)
	return strings.Replace(mantissa, ".", "", 1), exp
}

// roundHalfUp keeps n digits, rounding ties away from zero. A carry out of
// the first digit returns one more digit ("999" -> "1000").
func roundHalfUp(digits string, n int) string {
	if n >= len(digits) {
		return digits + strings.Repeat("0", n-len(digits))
	}
	kept := []byte(digits[:n])
	if n < 0 || digits[n] < '5' {
		return string(kept)
	}
	for i := len(kept) - 1; i >= 0; i-- {
		if kept[i] < '9' {
			kept[i]++
			return string(kept)
		}
		kept[i] = '0'
	}
	return "1" + string(kept)
}

// toPrecision is Number(v.toPrecision(p)).
func toPrecision(v float64, p int) float64 {
	if v == 0 || math.IsNaN(v) || math.IsInf(v, 0) {
		return v
	}
	digits, exp := exactDigits(v)
	rounded := roundHalfUp(digits, p)
	if len(rounded) > p {
		exp++
		rounded = rounded[:p]
	}
	out, _ := strconv.ParseFloat(rounded+"e"+strconv.Itoa(exp-len(rounded)+1), 64)
	if v < 0 {
		return -out
	}
	return out
}

// toExponential is v.toExponential(f) for finite v.
func toExponential(v float64, f int) string {
	sign := ""
	if v < 0 {
		sign = "-"
	}
	if v == 0 {
		return sign + "0." + strings.Repeat("0", f) + "e+0"
	}
	digits, exp := exactDigits(v)
	rounded := roundHalfUp(digits, f+1)
	if len(rounded) > f+1 {
		exp++
		rounded = rounded[:f+1]
	}
	mantissa := rounded[:1]
	if f > 0 {
		mantissa += "." + rounded[1:]
	}
	exponent := strconv.Itoa(exp)
	if exp >= 0 {
		exponent = "+" + exponent
	}
	return sign + mantissa + "e" + exponent
}

// localeNumber is v.toLocaleString('en-US', {minimumFractionDigits,
// maximumFractionDigits}): the shortest decimal form of v, rounded half away
// from zero, with thousands separators.
func localeNumber(v float64, minFraction, maxFraction int) string {
	if math.IsNaN(v) {
		return "NaN"
	}
	if math.IsInf(v, 0) {
		if v < 0 {
			return "-∞"
		}
		return "∞"
	}
	sign := ""
	if math.Signbit(v) {
		sign = "-"
	}
	if v == 0 {
		return sign + "0" + fractionZeros(minFraction)
	}
	digits, exp := shortestDigits(v)
	// Place the digits around the decimal point.
	var whole, fraction string
	if exp >= 0 {
		if len(digits) > exp+1 {
			whole, fraction = digits[:exp+1], digits[exp+1:]
		} else {
			whole = digits + strings.Repeat("0", exp+1-len(digits))
		}
	} else {
		whole, fraction = "0", strings.Repeat("0", -exp-1)+digits
	}
	if len(fraction) > maxFraction {
		rounded := roundHalfUp(whole+fraction, len(whole)+maxFraction)
		if len(rounded) > len(whole)+maxFraction {
			whole, fraction = rounded[:len(whole)+1], rounded[len(whole)+1:]
		} else {
			whole, fraction = rounded[:len(whole)], rounded[len(whole):]
		}
		whole = strings.TrimLeft(whole, "0")
		if whole == "" {
			whole = "0"
		}
	}
	fraction = strings.TrimRight(fraction, "0")
	if len(fraction) < minFraction {
		fraction += strings.Repeat("0", minFraction-len(fraction))
	}
	out := sign + group(whole)
	if fraction != "" {
		out += "." + fraction
	}
	return out
}

func shortestDigits(v float64) (string, int) {
	text := strconv.FormatFloat(math.Abs(v), 'e', -1, 64)
	mantissa, exponent, _ := strings.Cut(text, "e")
	exp, _ := strconv.Atoi(exponent)
	return strings.Replace(mantissa, ".", "", 1), exp
}

func group(whole string) string {
	if len(whole) <= 3 {
		return whole
	}
	var b strings.Builder
	head := len(whole) % 3
	if head > 0 {
		b.WriteString(whole[:head])
	}
	for i := head; i < len(whole); i += 3 {
		if b.Len() > 0 {
			b.WriteByte(',')
		}
		b.WriteString(whole[i : i+3])
	}
	return b.String()
}

func fractionZeros(n int) string {
	if n == 0 {
		return ""
	}
	return "." + strings.Repeat("0", n)
}
