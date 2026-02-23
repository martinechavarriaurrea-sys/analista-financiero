"""Domain-specific exceptions for clearer user messaging."""


class AnalyzerError(Exception):
    """Base application error."""


class CompanyNotFoundError(AnalyzerError):
    """Raised when no company can be found from query."""


class DataUnavailableError(AnalyzerError):
    """Raised when financial data cannot be retrieved."""


class SourceFormatError(AnalyzerError):
    """Raised when source format changed and parser fails."""


class ConnectivityError(AnalyzerError):
    """Raised when a network problem happens."""
