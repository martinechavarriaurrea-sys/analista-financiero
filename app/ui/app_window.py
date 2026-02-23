"""Main desktop UI built with CustomTkinter."""

from __future__ import annotations

import logging
import threading
import tkinter as tk
from tkinter import messagebox, ttk
from typing import Callable, Dict, List

import customtkinter as ctk
import numpy as np
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure

from app.config import APP_NAME, DEFAULT_METRICS, METRIC_LABELS
from app.core.exceptions import AnalyzerError
from app.core.paths import get_app_workspace
from app.models.entities import AnalysisPackage, CompanyRecord, MetricExplanation
from app.services.analysis_service import AnalysisService
from app.services.explanation_service import build_explanations
from app.services.report_exporter import ReportExporter
from app.ui.theme import FONT_BODY, FONT_SUBTITLE, FONT_TITLE, apply_theme, palette
from app.utils.numbers import format_currency, format_number

LOGGER = logging.getLogger(__name__)


class AnalyzerApp(ctk.CTk):
    def __init__(self) -> None:
        apply_theme()
        super().__init__()

        self.colors = palette()
        self.analysis_service = AnalysisService()
        self.exporter = ReportExporter()

        self.search_results: List[CompanyRecord] = []
        self.full_analysis: AnalysisPackage | None = None
        self.current_analysis: AnalysisPackage | None = None
        self.current_explanations: Dict[str, MetricExplanation] = {}

        self.year_vars: Dict[int, tk.BooleanVar] = {}
        self.metric_vars: Dict[str, tk.BooleanVar] = {}

        self.metric_keys = list(dict.fromkeys(DEFAULT_METRICS + ["balance_general"]))

        self.title(f"{APP_NAME} v1.0")
        self.geometry("1470x900")
        self.minsize(1250, 780)
        self.configure(fg_color=self.colors["bg"])

        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(1, weight=1)

        self._build_header()
        self._build_sidebar()
        self._build_content()
        self._set_status(f"Carpeta de trabajo: {get_app_workspace()}")

    def _build_header(self) -> None:
        header = ctk.CTkFrame(self, fg_color=self.colors["primary"], corner_radius=0)
        header.grid(row=0, column=0, columnspan=2, sticky="nsew")
        header.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            header,
            text="Analizador de Empresas (Supersociedades)",
            font=FONT_TITLE,
            text_color="white",
        )
        title.grid(row=0, column=0, padx=18, pady=(12, 2), sticky="w")

        subtitle = ctk.CTkLabel(
            header,
            text="Busqueda por NIT o nombre | Ultimos 7 anos | Indicadores y explicaciones amigables",
            font=FONT_BODY,
            text_color="#D6E8FF",
        )
        subtitle.grid(row=1, column=0, padx=18, pady=(0, 12), sticky="w")

    def _build_sidebar(self) -> None:
        sidebar = ctk.CTkFrame(self, fg_color=self.colors["panel"], corner_radius=14)
        sidebar.grid(row=1, column=0, sticky="nsew", padx=(14, 8), pady=12)
        sidebar.grid_rowconfigure(7, weight=1)

        ctk.CTkLabel(sidebar, text="Busqueda", font=FONT_SUBTITLE, text_color=self.colors["text"]).grid(
            row=0, column=0, padx=14, pady=(14, 8), sticky="w"
        )

        self.search_mode = ctk.StringVar(value="nombre")
        mode = ctk.CTkSegmentedButton(
            sidebar,
            values=["nombre", "nit"],
            variable=self.search_mode,
            selected_color=self.colors["secondary"],
            unselected_color=self.colors["panel_alt"],
        )
        mode.grid(row=1, column=0, padx=14, pady=(0, 8), sticky="ew")

        self.search_entry = ctk.CTkEntry(sidebar, placeholder_text="Ej: ECOPETROL o 900925798")
        self.search_entry.grid(row=2, column=0, padx=14, pady=(0, 8), sticky="ew")

        self.search_button = ctk.CTkButton(
            sidebar,
            text="Buscar empresa",
            command=self._on_search,
            fg_color=self.colors["secondary"],
            hover_color=self.colors["primary_dark"],
        )
        self.search_button.grid(row=3, column=0, padx=14, pady=(0, 10), sticky="ew")

        list_frame = ctk.CTkFrame(sidebar, fg_color=self.colors["panel_alt"])
        list_frame.grid(row=4, column=0, padx=14, pady=(0, 8), sticky="nsew")
        list_frame.grid_rowconfigure(0, weight=1)
        list_frame.grid_columnconfigure(0, weight=1)

        self.results_listbox = tk.Listbox(
            list_frame,
            height=6,
            bg="#F7FBFF",
            fg="#0E2A47",
            font=("Work Sans", 11),
            selectbackground="#2E7CBF",
            activestyle="none",
            borderwidth=0,
            highlightthickness=0,
        )
        self.results_listbox.grid(row=0, column=0, sticky="nsew", padx=6, pady=6)

        self.load_button = ctk.CTkButton(
            sidebar,
            text="Cargar datos financieros",
            command=self._on_load_analysis,
            fg_color=self.colors["primary"],
            hover_color=self.colors["primary_dark"],
        )
        self.load_button.grid(row=5, column=0, padx=14, pady=(0, 8), sticky="ew")

        self.refresh_button = ctk.CTkButton(
            sidebar,
            text="Actualizar vista",
            command=self._refresh_view,
            fg_color=self.colors["accent"],
            text_color="#073B5A",
            hover_color="#3198E0",
        )
        self.refresh_button.grid(row=6, column=0, padx=14, pady=(0, 10), sticky="ew")

        selector_scroll = ctk.CTkScrollableFrame(sidebar, fg_color=self.colors["panel_alt"], corner_radius=10)
        selector_scroll.grid(row=7, column=0, padx=14, pady=(0, 10), sticky="nsew")
        selector_scroll.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            selector_scroll,
            text="Anios disponibles (ultimos 7)",
            font=("Montserrat", 13, "bold"),
            text_color=self.colors["text"],
        ).grid(row=0, column=0, sticky="w", pady=(8, 4), padx=4)

        self.years_frame = ctk.CTkFrame(selector_scroll, fg_color="transparent")
        self.years_frame.grid(row=1, column=0, sticky="ew", padx=4)

        ctk.CTkLabel(
            selector_scroll,
            text="Metricas",
            font=("Montserrat", 13, "bold"),
            text_color=self.colors["text"],
        ).grid(row=2, column=0, sticky="w", pady=(12, 4), padx=4)

        self.metrics_frame = ctk.CTkFrame(selector_scroll, fg_color="transparent")
        self.metrics_frame.grid(row=3, column=0, sticky="ew", padx=4, pady=(0, 8))

        self._build_metric_checkboxes()

        export_frame = ctk.CTkFrame(sidebar, fg_color="transparent")
        export_frame.grid(row=8, column=0, padx=14, pady=(0, 14), sticky="ew")
        export_frame.grid_columnconfigure((0, 1), weight=1)

        self.export_excel_button = ctk.CTkButton(
            export_frame,
            text="Exportar Excel",
            command=lambda: self._on_export("excel"),
            fg_color="#2F855A",
            hover_color="#276749",
        )
        self.export_excel_button.grid(row=0, column=0, padx=(0, 6), sticky="ew")

        self.export_pdf_button = ctk.CTkButton(
            export_frame,
            text="Exportar PDF",
            command=lambda: self._on_export("pdf"),
            fg_color="#0F4C81",
            hover_color="#083A63",
        )
        self.export_pdf_button.grid(row=0, column=1, padx=(6, 0), sticky="ew")

    def _build_content(self) -> None:
        content = ctk.CTkFrame(self, fg_color=self.colors["panel"], corner_radius=14)
        content.grid(row=1, column=1, sticky="nsew", padx=(8, 14), pady=12)
        content.grid_columnconfigure(0, weight=1)
        content.grid_rowconfigure(1, weight=1)

        self.status_label = ctk.CTkLabel(
            content,
            text="Listo.",
            anchor="w",
            font=FONT_BODY,
            text_color=self.colors["text_light"],
        )
        self.status_label.grid(row=0, column=0, padx=14, pady=(10, 4), sticky="ew")

        tabs = ctk.CTkTabview(content, fg_color=self.colors["panel_alt"], segmented_button_fg_color=self.colors["panel"])
        tabs.grid(row=1, column=0, sticky="nsew", padx=10, pady=(0, 10))

        self.tab_summary = tabs.add("Resumen")
        self.tab_chart = tabs.add("Grafica + Explicacion")
        self.tab_warnings = tabs.add("Mensajes")

        self._build_summary_tab()
        self._build_chart_tab()
        self._build_warning_tab()

    def _build_summary_tab(self) -> None:
        self.tab_summary.grid_rowconfigure(0, weight=1)
        self.tab_summary.grid_columnconfigure(0, weight=1)

        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure(
            "Treeview",
            rowheight=28,
            background="white",
            foreground="#0F2745",
            fieldbackground="white",
        )
        style.configure(
            "Treeview.Heading",
            font=("Montserrat", 10, "bold"),
            background=self.colors["primary"],
            foreground="white",
        )

        self.table = ttk.Treeview(self.tab_summary, show="headings")
        self.table.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)

        scroll_y = ttk.Scrollbar(self.tab_summary, orient="vertical", command=self.table.yview)
        self.table.configure(yscrollcommand=scroll_y.set)
        scroll_y.grid(row=0, column=1, sticky="ns", pady=10)

    def _build_chart_tab(self) -> None:
        self.tab_chart.grid_rowconfigure(1, weight=1)
        self.tab_chart.grid_columnconfigure(0, weight=2)
        self.tab_chart.grid_columnconfigure(1, weight=1)

        self.metric_option_value = ctk.StringVar(value=self.metric_keys[0])
        self.metric_option = ctk.CTkOptionMenu(
            self.tab_chart,
            values=self.metric_keys,
            variable=self.metric_option_value,
            command=lambda _val: self._render_selected_metric(),
            fg_color=self.colors["secondary"],
            button_color=self.colors["primary"],
        )
        self.metric_option.grid(row=0, column=0, padx=10, pady=(10, 6), sticky="w")

        chart_container = ctk.CTkFrame(self.tab_chart, fg_color="white")
        chart_container.grid(row=1, column=0, sticky="nsew", padx=(10, 5), pady=(0, 10))
        chart_container.grid_rowconfigure(0, weight=1)
        chart_container.grid_columnconfigure(0, weight=1)

        self.figure = Figure(figsize=(7.5, 4.5), dpi=100)
        self.ax = self.figure.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.figure, master=chart_container)
        self.canvas.get_tk_widget().grid(row=0, column=0, sticky="nsew", padx=8, pady=8)

        self.explanation_text = ctk.CTkTextbox(
            self.tab_chart,
            fg_color="#F7FBFF",
            text_color=self.colors["text"],
            font=FONT_BODY,
            wrap="word",
        )
        self.explanation_text.grid(row=1, column=1, sticky="nsew", padx=(5, 10), pady=(0, 10))

    def _build_warning_tab(self) -> None:
        self.warning_text = ctk.CTkTextbox(
            self.tab_warnings,
            fg_color="#F7FBFF",
            text_color=self.colors["text"],
            font=FONT_BODY,
        )
        self.warning_text.pack(fill="both", expand=True, padx=10, pady=10)

    def _build_metric_checkboxes(self) -> None:
        for child in self.metrics_frame.winfo_children():
            child.destroy()

        self.metric_vars.clear()
        for i, metric_key in enumerate(self.metric_keys):
            var = tk.BooleanVar(value=True)
            self.metric_vars[metric_key] = var
            checkbox = ctk.CTkCheckBox(
                self.metrics_frame,
                text=METRIC_LABELS.get(metric_key, metric_key),
                variable=var,
                checkbox_width=18,
                checkbox_height=18,
                border_color=self.colors["secondary"],
                fg_color=self.colors["secondary"],
                hover_color=self.colors["primary"],
                font=FONT_BODY,
            )
            checkbox.grid(row=i, column=0, sticky="w", pady=2)

    def _populate_year_checkboxes(self, years: List[int]) -> None:
        for child in self.years_frame.winfo_children():
            child.destroy()

        self.year_vars.clear()
        for i, year in enumerate(sorted(years, reverse=True)):
            var = tk.BooleanVar(value=True)
            self.year_vars[year] = var
            ctk.CTkCheckBox(
                self.years_frame,
                text=str(year),
                variable=var,
                checkbox_width=18,
                checkbox_height=18,
                border_color=self.colors["secondary"],
                fg_color=self.colors["secondary"],
                hover_color=self.colors["primary"],
                font=FONT_BODY,
            ).grid(row=i, column=0, sticky="w", pady=2)

    def _set_status(self, text: str) -> None:
        self.status_label.configure(text=text)
        self.update_idletasks()

    def _on_search(self) -> None:
        query = self.search_entry.get().strip()
        mode = self.search_mode.get().strip().lower()

        if not query:
            messagebox.showwarning("Busqueda", "Ingresa un NIT o nombre para buscar.")
            return

        self._set_status("Buscando empresa en Supersociedades...")

        def worker() -> List[CompanyRecord]:
            return self.analysis_service.search_companies(query=query, by=mode)

        self._run_in_thread(worker=worker, on_success=self._after_search)

    def _after_search(self, results: List[CompanyRecord]) -> None:
        self.search_results = results
        self.results_listbox.delete(0, tk.END)

        for company in results:
            self.results_listbox.insert(tk.END, company.display_label())

        if results:
            self.results_listbox.selection_set(0)
            self.results_listbox.activate(0)
            self._set_status(f"Empresas encontradas: {len(results)}. Selecciona una y carga el analisis.")

    def _selected_company(self) -> CompanyRecord | None:
        selection = self.results_listbox.curselection()
        if not selection:
            return self.search_results[0] if self.search_results else None
        return self.search_results[selection[0]]

    def _on_load_analysis(self) -> None:
        company = self._selected_company()
        if not company:
            messagebox.showwarning("Empresa", "Primero debes buscar y seleccionar una empresa.")
            return

        self._set_status(f"Descargando y consolidando datos financieros para {company.razon_social}...")

        def worker() -> AnalysisPackage:
            return self.analysis_service.analyze_company(company=company)

        self._run_in_thread(worker=worker, on_success=self._after_analysis_loaded)

    def _after_analysis_loaded(self, analysis: AnalysisPackage) -> None:
        self.full_analysis = analysis
        self._populate_year_checkboxes(analysis.years)
        self._refresh_view()
        self._set_status(
            f"Analisis cargado para {analysis.company.razon_social}. Ajusta anos/metricas y exporta cuando quieras."
        )

    def _refresh_view(self) -> None:
        if not self.full_analysis:
            return

        selected_years = sorted([year for year, var in self.year_vars.items() if var.get()])
        if not selected_years:
            messagebox.showwarning("Anios", "Selecciona al menos un ano para mostrar resultados.")
            return

        selected_metrics = [k for k, var in self.metric_vars.items() if var.get()]
        if not selected_metrics:
            messagebox.showwarning("Metricas", "Selecciona al menos una metrica.")
            return

        snapshots = {y: self.full_analysis.snapshots[y] for y in selected_years}
        self.current_analysis = AnalysisPackage(
            company=self.full_analysis.company,
            years=selected_years,
            snapshots=snapshots,
        )
        self.current_explanations = build_explanations(
            analysis=self.current_analysis,
            metric_keys=selected_metrics,
        )

        self._update_table(selected_metrics)
        self.metric_option.configure(values=selected_metrics)

        current_metric = self.metric_option_value.get()
        if current_metric not in selected_metrics:
            self.metric_option_value.set(selected_metrics[0])

        self._render_selected_metric()
        self._update_warnings()

    def _update_table(self, metric_keys: List[str]) -> None:
        self.table.delete(*self.table.get_children())

        columns = ["anio"] + metric_keys
        self.table.configure(columns=columns)

        for column in columns:
            label = "Ano" if column == "anio" else METRIC_LABELS.get(column, column)
            self.table.heading(column, text=label)
            width = 120 if column == "anio" else 180
            self.table.column(column, width=width, anchor="center")

        if not self.current_analysis:
            return

        for year in sorted(self.current_analysis.years):
            snapshot = self.current_analysis.snapshots[year]
            row = [str(year)]
            for metric_key in metric_keys:
                value = snapshot.metrics.get(metric_key)
                if metric_key in {"dias_capital_trabajo", "z_altman"}:
                    row.append(format_number(value, 2))
                else:
                    row.append(format_currency(value))
            self.table.insert("", "end", values=row)

    def _render_selected_metric(self) -> None:
        if not self.current_analysis:
            return

        metric_key = self.metric_option_value.get()
        years = sorted(self.current_analysis.years)

        self.ax.clear()
        self.ax.set_facecolor("#FFFFFF")

        if metric_key == "balance_general":
            activos = [self.current_analysis.snapshots[y].balance_sheet.get("activos_totales") for y in years]
            pasivos = [self.current_analysis.snapshots[y].balance_sheet.get("pasivos_totales") for y in years]
            patrimonio = [self.current_analysis.snapshots[y].balance_sheet.get("patrimonio_total") for y in years]

            activos = [np.nan if v is None else v for v in activos]
            pasivos = [np.nan if v is None else v for v in pasivos]
            patrimonio = [np.nan if v is None else v for v in patrimonio]

            self.ax.plot(years, activos, marker="o", linewidth=2, color="#0F4C81", label="Activos")
            self.ax.plot(years, pasivos, marker="o", linewidth=2, color="#C53030", label="Pasivos")
            self.ax.plot(years, patrimonio, marker="o", linewidth=2, color="#2F855A", label="Patrimonio")
            self.ax.legend(loc="best")
            self.ax.set_ylabel("COP")
        else:
            values = [self.current_analysis.snapshots[y].metrics.get(metric_key) for y in years]
            values = [0 if v is None else v for v in values]
            bars = self.ax.bar(years, values, color=self.colors["secondary"], width=0.55)
            for bar in bars:
                height = bar.get_height()
                self.ax.annotate(
                    f"{height:,.0f}",
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha="center",
                    va="bottom",
                    fontsize=8,
                    color="#0F2745",
                )
            self.ax.set_ylabel("Valor")

        self.ax.set_title(METRIC_LABELS.get(metric_key, metric_key), fontsize=12, color="#0F2745")
        self.ax.set_xlabel("Ano")
        self.ax.grid(axis="y", linestyle="--", alpha=0.35)
        self.figure.tight_layout()
        self.canvas.draw()

        self._update_explanation(metric_key)

    def _update_explanation(self, metric_key: str) -> None:
        explanation = self.current_explanations.get(metric_key)
        self.explanation_text.delete("1.0", "end")

        if not explanation:
            self.explanation_text.insert("1.0", "Sin explicacion disponible para esta metrica.")
            return

        block = (
            f"{METRIC_LABELS.get(metric_key, metric_key)}\n\n"
            f"Que significa\n{explanation.what_is}\n\n"
            f"Como interpretarlo\n{explanation.interpretation}\n\n"
            f"Senales positivas/negativas\n{explanation.signals}\n\n"
            f"Preguntas de negocio sugeridas\n{explanation.business_questions}"
        )
        self.explanation_text.insert("1.0", block)

    def _update_warnings(self) -> None:
        self.warning_text.delete("1.0", "end")
        if not self.current_analysis:
            return

        warnings = self.current_analysis.warnings()
        if not warnings:
            self.warning_text.insert(
                "1.0",
                "No se detectaron alertas de calidad de datos para los anos seleccionados.",
            )
            return

        joined = "\n".join(f"- {warning}" for warning in warnings)
        self.warning_text.insert("1.0", joined)

    def _on_export(self, export_type: str) -> None:
        if not self.current_analysis:
            messagebox.showwarning("Exportar", "Primero carga y visualiza un analisis.")
            return

        metric_keys = [k for k, var in self.metric_vars.items() if var.get()]
        if not metric_keys:
            messagebox.showwarning("Exportar", "Selecciona al menos una metrica para exportar.")
            return

        self._set_status("Generando reporte... esto puede tomar unos segundos.")

        def worker() -> str:
            if export_type == "excel":
                output = self.exporter.export_excel(
                    analysis=self.current_analysis,
                    metric_keys=metric_keys,
                    explanations=self.current_explanations,
                )
            else:
                output = self.exporter.export_pdf(
                    analysis=self.current_analysis,
                    metric_keys=metric_keys,
                    explanations=self.current_explanations,
                )
            return str(output)

        def on_success(path: str) -> None:
            self._set_status(f"Reporte generado en: {path}")
            messagebox.showinfo("Exportacion completada", f"Archivo guardado en:\n{path}")

        self._run_in_thread(worker=worker, on_success=on_success)

    def _run_in_thread(self, worker: Callable[[], object], on_success: Callable[[object], None]) -> None:
        def runner() -> None:
            try:
                result = worker()
                self.after(0, lambda: on_success(result))
            except AnalyzerError as exc:
                LOGGER.exception("Business error")
                self.after(0, lambda: self._handle_error(str(exc)))
            except Exception as exc:  # pragma: no cover - unexpected path
                LOGGER.exception("Unexpected error")
                self.after(0, lambda: self._handle_error(str(exc)))

        threading.Thread(target=runner, daemon=True).start()

    def _handle_error(self, message: str) -> None:
        self._set_status(f"Error: {message}")
        messagebox.showerror("Error", message)
