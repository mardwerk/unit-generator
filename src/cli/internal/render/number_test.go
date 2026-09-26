package render

import "testing"

func TestJavaScriptNumberFormatting(t *testing.T) {
	for _, c := range []struct {
		got, want string
	}{
		{localeNumber(1234.5, 2, 8), "1,234.50"},
		{localeNumber(0.000123456789, 2, 8), "0.00012346"},
		{localeNumber(0.125, 0, 2), "0.13"},
		{localeNumber(999.9999, 0, 3), "1,000"},
		{localeNumber(1234567, 0, 3), "1,234,567"},
		{localeNumber(0, 2, 8), "0.00"},
		{toExponential(5e-9, 3), "5.000e-9"},
		{toExponential(9.99951e-9, 3), "1.000e-8"},
		{FormatCost(ptrFloat(0.0123)), "$0.0123 USD"},
		{FormatCost(ptrFloat(3e-9)), "$3.000e-9 USD"},
	} {
		if c.got != c.want {
			t.Errorf("got %q, want %q", c.got, c.want)
		}
	}
	for _, c := range []struct{ value, want float64 }{
		{12.125, 12.13},
		{1002.5, 1003},
		{999.95, 1000},
		{0.000123456, 0.0001235},
		{-2.5, -2.5},
	} {
		if got := toPrecision(c.value, 4); got != c.want {
			t.Errorf("toPrecision(%v, 4) = %v, want %v", c.value, got, c.want)
		}
	}
}

func ptrFloat(v float64) *float64 { return &v }
