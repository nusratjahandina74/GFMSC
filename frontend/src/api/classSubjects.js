import apiClient from './client';

// GET /api/class-subjects/:className -> { subjects: [...] }
export const getSubjectsForClass = async (className) => {
  try {
    const response = await apiClient.get(`/class-subjects/${encodeURIComponent(className)}`);
    return response.data.subjects || [];
  } catch (error) {
    console.error('Error fetching subjects for class:', error);
    throw error;
  }
};

export const getClassSubjects = async (params = {}) => {
  try {
    const response = await apiClient.get('/class-subjects', { params });
    return response.data.classSubjects || [];
  } catch (error) {
    console.error('Error fetching class subjects:', error);
    throw error;
  }
};

export const getClassSubjectById = async (id) => {
  try {
    const response = await apiClient.get(`/class-subjects/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching class subject:', error);
    throw error;
  }
};

export const createClassSubject = async (data) => {
  try {
    const response = await apiClient.post('/class-subjects', data);
    return response.data;
  } catch (error) {
    console.error('Error creating class subject:', error);
    throw error;
  }
};

export const updateClassSubject = async (id, data) => {
  try {
    const response = await apiClient.put(`/class-subjects/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating class subject:', error);
    throw error;
  }
};

export const deleteClassSubject = async (id) => {
  try {
    const response = await apiClient.delete(`/class-subjects/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting class subject:', error);
    throw error;
  }
};
