package main

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type Subject struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Icon       string  `json:"icon"`
	World      string  `json:"world"`
	PositionX  float64 `json:"position_x"`
	PositionZ  float64 `json:"position_z"`
	SortOrder  int     `json:"sort_order"`
}

type Question struct {
	ID           int64           `json:"id"`
	SubjectID    int64           `json:"subject_id"`
	Kind         string          `json:"kind"`
	Prompt       string          `json:"prompt"`
	Choices      json.RawMessage `json:"choices,omitempty"`
	CorrectIndex *int            `json:"correct_index,omitempty"`
	CorrectText  *string         `json:"correct_text,omitempty"`
	Explanation  string          `json:"explanation,omitempty"`
	SortOrder    int             `json:"sort_order"`
}

// RegisterSubjectRoutes: teacher-only CRUD for buildings (subjects) and
// their questions. Public read endpoints for the 3D game live under
// /api/public/* (see student.go) so players never see answer keys they
// shouldn't (though for this single-teacher MVP the question list IS sent
// to the client to render the quiz - ponytail: move correct-answer
// checking server-side if this is ever used for graded exams where
// client-side cheating matters).
func RegisterSubjectRoutes(r chi.Router, app *App) {
	r.Get("/subjects", app.handleListSubjects) // public: game needs to know the map
	r.Group(func(r chi.Router) {
		r.Post("/subjects", app.handleCreateSubject)
		r.Put("/subjects/{id}", app.handleUpdateSubject)
		r.Delete("/subjects/{id}", app.handleDeleteSubject)
		r.Get("/subjects/{id}/questions", app.handleListQuestions)
		r.Post("/subjects/{id}/questions", app.handleCreateQuestion)
		r.Put("/questions/{id}", app.handleUpdateQuestion)
		r.Delete("/questions/{id}", app.handleDeleteQuestion)
	})
}

func (app *App) handleListSubjects(w http.ResponseWriter, r *http.Request) {
	rows, err := app.DB.Query(r.Context(), "SELECT id,name,icon,world,position_x,position_z,sort_order FROM subjects ORDER BY sort_order,id")
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []Subject
	for rows.Next() {
		var s Subject
		if err := rows.Scan(&s.ID, &s.Name, &s.Icon, &s.World, &s.PositionX, &s.PositionZ, &s.SortOrder); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, out)
}

func (app *App) handleCreateSubject(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.requireTeacher(w, r); !ok {
		return
	}
	var s Subject
	if err := decodeJSON(r, &s); err != nil {
		jsonError(w, http.StatusBadRequest, "bad request")
		return
	}
	if s.Icon == "" {
		s.Icon = "📘"
	}
	if s.World == "" {
		s.World = "kota"
	}
	err := app.DB.QueryRow(r.Context(),
		"INSERT INTO subjects (name,icon,world,position_x,position_z,sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
		s.Name, s.Icon, s.World, s.PositionX, s.PositionZ, s.SortOrder).Scan(&s.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (app *App) handleUpdateSubject(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.requireTeacher(w, r); !ok {
		return
	}
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var s Subject
	if err := decodeJSON(r, &s); err != nil {
		jsonError(w, http.StatusBadRequest, "bad request")
		return
	}
	_, err := app.DB.Exec(r.Context(),
		"UPDATE subjects SET name=$1,icon=$2,world=$3,position_x=$4,position_z=$5,sort_order=$6 WHERE id=$7",
		s.Name, s.Icon, s.World, s.PositionX, s.PositionZ, s.SortOrder, id)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (app *App) handleDeleteSubject(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.requireTeacher(w, r); !ok {
		return
	}
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	_, err := app.DB.Exec(r.Context(), "DELETE FROM subjects WHERE id=$1", id)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (app *App) handleListQuestions(w http.ResponseWriter, r *http.Request) {
	subjectID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	rows, err := app.DB.Query(r.Context(),
		"SELECT id,subject_id,kind,prompt,choices,correct_index,correct_text,explanation,sort_order FROM questions WHERE subject_id=$1 ORDER BY sort_order,id",
		subjectID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []Question
	for rows.Next() {
		var q Question
		if err := rows.Scan(&q.ID, &q.SubjectID, &q.Kind, &q.Prompt, &q.Choices, &q.CorrectIndex, &q.CorrectText, &q.Explanation, &q.SortOrder); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}
		out = append(out, q)
	}
	writeJSON(w, http.StatusOK, out)
}

func (app *App) handleCreateQuestion(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.requireTeacher(w, r); !ok {
		return
	}
	subjectID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var q Question
	if err := decodeJSON(r, &q); err != nil {
		jsonError(w, http.StatusBadRequest, "bad request")
		return
	}
	if q.Kind == "" {
		q.Kind = "mc"
	}
	err := app.DB.QueryRow(r.Context(),
		"INSERT INTO questions (subject_id,kind,prompt,choices,correct_index,correct_text,explanation,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
		subjectID, q.Kind, q.Prompt, q.Choices, q.CorrectIndex, q.CorrectText, q.Explanation, q.SortOrder).Scan(&q.ID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	q.SubjectID = subjectID
	writeJSON(w, http.StatusOK, q)
}

func (app *App) handleUpdateQuestion(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.requireTeacher(w, r); !ok {
		return
	}
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var q Question
	if err := decodeJSON(r, &q); err != nil {
		jsonError(w, http.StatusBadRequest, "bad request")
		return
	}
	_, err := app.DB.Exec(r.Context(),
		"UPDATE questions SET kind=$1,prompt=$2,choices=$3,correct_index=$4,correct_text=$5,explanation=$6,sort_order=$7 WHERE id=$8",
		q.Kind, q.Prompt, q.Choices, q.CorrectIndex, q.CorrectText, q.Explanation, q.SortOrder, id)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (app *App) handleDeleteQuestion(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.requireTeacher(w, r); !ok {
		return
	}
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	_, err := app.DB.Exec(r.Context(), "DELETE FROM questions WHERE id=$1", id)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
